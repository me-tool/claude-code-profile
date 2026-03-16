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
});
