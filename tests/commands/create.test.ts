import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir, createMockClaudeDir } from '../helpers/setup';
import { runInit } from '../../src/commands/init';
import { runCreate } from '../../src/commands/create';

describe('create command', () => {
  let tempDir: string;
  let claudeDir: string;
  let profilesDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    claudeDir = await createMockClaudeDir(tempDir);
    profilesDir = path.join(tempDir, '.claude-profiles');
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
  });

  afterEach(async () => { await cleanupTempDir(tempDir); });

  it('should create empty profile', async () => {
    await runCreate({ name: 'reviewer', profilesDir, skipPrompts: true, importItems: [] });
    const profileDir = path.join(profilesDir, 'reviewer');
    expect(await fs.pathExists(profileDir)).toBe(true);
    expect(await fs.pathExists(path.join(profileDir, '.profile.json'))).toBe(true);
    expect(await fs.pathExists(path.join(profileDir, 'CLAUDE.md'))).toBe(true);
    expect(await fs.pathExists(path.join(profileDir, '.git'))).toBe(true);
  });

  it('should create profile with --from (full clone)', async () => {
    await runCreate({ name: 'work', profilesDir, from: 'default', skipPrompts: true });
    expect(await fs.pathExists(path.join(profilesDir, 'work', 'settings.json'))).toBe(true);
  });

  it('should create profile with selective import', async () => {
    await runCreate({ name: 'partial', profilesDir, from: 'default', skipPrompts: true, importItems: ['auth'] });
    expect(await fs.pathExists(path.join(profilesDir, 'partial', 'credentials.json'))).toBe(true);
  });

  it('should reject duplicate name', async () => {
    await expect(runCreate({ name: 'default', profilesDir, skipPrompts: true, importItems: [] })).rejects.toThrow(/already exists/i);
  });

  it('should reject invalid name', async () => {
    await expect(runCreate({ name: '.bad', profilesDir, skipPrompts: true, importItems: [] })).rejects.toThrow();
  });

  it('should register profile in .ccp.json', async () => {
    await runCreate({ name: 'test', profilesDir, skipPrompts: true, importItems: [] });
    const config = await fs.readJson(path.join(profilesDir, '.ccp.json'));
    expect(config.profiles).toContain('test');
  });
});
