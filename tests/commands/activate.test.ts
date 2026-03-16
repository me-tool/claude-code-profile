import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir, createMockClaudeDir } from '../helpers/setup';
import { runInit } from '../../src/commands/init';
import { runCreate } from '../../src/commands/create';
import { runActivate } from '../../src/commands/activate';
import { runCurrent } from '../../src/commands/current';

describe('activate/current', () => {
  let tempDir: string;
  let claudeDir: string;
  let profilesDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    claudeDir = await createMockClaudeDir(tempDir);
    profilesDir = path.join(tempDir, '.claude-profiles');
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
    await runCreate({ name: 'work', profilesDir, skipPrompts: true, importItems: [] });
  });

  afterEach(async () => { await cleanupTempDir(tempDir); });

  it('should switch active profile', async () => {
    await runActivate({ name: 'work', claudeDir, profilesDir, skipConfirm: true, force: true });
    const target = await fs.readlink(claudeDir);
    expect(target).toBe(path.join(profilesDir, 'work'));
  });

  it('should update .ccp.json active field', async () => {
    await runActivate({ name: 'work', claudeDir, profilesDir, skipConfirm: true, force: true });
    const config = await fs.readJson(path.join(profilesDir, '.ccp.json'));
    expect(config.active).toBe('work');
  });

  it('should return current active profile', async () => {
    const name = await runCurrent({ profilesDir });
    expect(name).toBe('default');
  });

  it('should reject activating nonexistent profile', async () => {
    await expect(
      runActivate({ name: 'nope', claudeDir, profilesDir, skipConfirm: true, force: true })
    ).rejects.toThrow(/not found/i);
  });
});
