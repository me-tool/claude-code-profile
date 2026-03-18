import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir } from '../helpers/setup';
import {
  createProfileMeta,
  readProfileMeta,
  writeProfileMeta,
  validateProfileDir,
  validateProfileName,
  resolveProfileDir,
  injectStatusBadge,
  restoreStatusLine,
} from '../../src/core/profile';

describe('profile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should create profile metadata', () => {
    const meta = createProfileMeta('reviewer', { description: 'Review only', importedFrom: 'default', importedItems: ['auth'] });
    expect(meta.name).toBe('reviewer');
    expect(meta.description).toBe('Review only');
    expect(meta.importedFrom).toBe('default');
    expect(meta.importedItems).toEqual(['auth']);
    expect(meta.createdAt).toBeDefined();
  });

  it('should write and read profile metadata', async () => {
    const profilePath = path.join(tempDir, '.profile.json');
    const meta = createProfileMeta('test');
    await writeProfileMeta(profilePath, meta);
    const read = await readProfileMeta(profilePath);
    expect(read.name).toBe('test');
  });

  it('should validate profile directory', async () => {
    const profileDir = path.join(tempDir, 'myprofile');
    await fs.ensureDir(profileDir);
    await writeProfileMeta(path.join(profileDir, '.profile.json'), createProfileMeta('myprofile'));
    const result = await validateProfileDir(profileDir);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid profile directory (no .profile.json)', async () => {
    const profileDir = path.join(tempDir, 'bad');
    await fs.ensureDir(profileDir);
    const result = await validateProfileDir(profileDir);
    expect(result.valid).toBe(false);
  });

  it('should validate profile names', () => {
    expect(validateProfileName('default')).toEqual({ valid: true });
    expect(validateProfileName('my-work')).toEqual({ valid: true });
    expect(validateProfileName('work_2')).toEqual({ valid: true });
    expect(validateProfileName('')).toEqual({ valid: false, reason: expect.any(String) });
    expect(validateProfileName('.hidden')).toEqual({ valid: false, reason: expect.any(String) });
    expect(validateProfileName('has space')).toEqual({ valid: false, reason: expect.any(String) });
    expect(validateProfileName('a/b')).toEqual({ valid: false, reason: expect.any(String) });
  });

  describe('resolveProfileDir', () => {
    it('should return path for valid existing profile', async () => {
      const profileDir = path.join(tempDir, 'myprofile');
      await fs.ensureDir(profileDir);
      await writeProfileMeta(path.join(profileDir, '.profile.json'), createProfileMeta('myprofile'));
      const result = await resolveProfileDir('myprofile', tempDir);
      expect(result).toBe(profileDir);
    });

    it('should throw for invalid profile name', async () => {
      await expect(resolveProfileDir('.bad', tempDir)).rejects.toThrow(/Invalid profile name/);
    });

    it('should throw for nonexistent profile', async () => {
      await expect(resolveProfileDir('nope', tempDir)).rejects.toThrow(/not found/);
    });
  });

  describe('injectStatusBadge', () => {
    it('should add badge when no statusLine exists', () => {
      const settings: Record<string, unknown> = {};
      const original = injectStatusBadge(settings);
      expect(original).toBeNull();
      expect(settings.statusLine).toEqual({ type: 'command', command: 'ccp current --badge' });
    });

    it('should prepend badge to existing statusLine', () => {
      const settings: Record<string, unknown> = {
        statusLine: { type: 'command', command: 'echo hello' },
      };
      const original = injectStatusBadge(settings);
      expect(original).toEqual({ type: 'command', command: 'echo hello' });
      expect(settings.statusLine).toEqual({ type: 'command', command: 'ccp current --badge && echo hello' });
    });

    it('should be idempotent', () => {
      const settings: Record<string, unknown> = {
        statusLine: { type: 'command', command: 'ccp current --badge && echo hello' },
      };
      const original = injectStatusBadge(settings);
      expect(original).toBeNull();
    });
  });

  describe('restoreStatusLine', () => {
    it('should restore original statusLine to claude dir', async () => {
      const profileDir = path.join(tempDir, 'profile');
      const claudeDir = path.join(tempDir, 'claude');
      await fs.ensureDir(profileDir);
      await fs.ensureDir(claudeDir);

      await fs.writeJson(path.join(profileDir, '.profile.json'), {
        name: 'test',
        originalStatusLine: { type: 'command', command: 'echo original' },
      });
      await fs.writeJson(path.join(claudeDir, 'settings.json'), {
        statusLine: { type: 'command', command: 'ccp current --badge && echo original' },
      });

      await restoreStatusLine(profileDir, claudeDir);
      const settings = await fs.readJson(path.join(claudeDir, 'settings.json'));
      expect(settings.statusLine).toEqual({ type: 'command', command: 'echo original' });
    });

    it('should do nothing when no meta exists', async () => {
      const profileDir = path.join(tempDir, 'no-meta');
      const claudeDir = path.join(tempDir, 'claude2');
      await fs.ensureDir(profileDir);
      await fs.ensureDir(claudeDir);
      await fs.writeJson(path.join(claudeDir, 'settings.json'), {
        statusLine: { type: 'command', command: 'ccp current --badge' },
      });

      await restoreStatusLine(profileDir, claudeDir);
      const settings = await fs.readJson(path.join(claudeDir, 'settings.json'));
      expect(settings.statusLine.command).toContain('ccp current --badge');
    });
  });
});
