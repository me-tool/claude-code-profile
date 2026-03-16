import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir, createMockClaudeDir } from '../helpers/setup';
import { runInit } from '../../src/commands/init';

describe('init command', () => {
  let tempDir: string;
  let claudeDir: string;
  let profilesDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    claudeDir = await createMockClaudeDir(tempDir);
    profilesDir = path.join(tempDir, '.claude-profiles');
  });

  afterEach(async () => { await cleanupTempDir(tempDir); });

  it('should migrate ~/.claude to profiles/default', async () => {
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
    const defaultDir = path.join(profilesDir, 'default');
    expect(await fs.pathExists(defaultDir)).toBe(true);
    expect(await fs.pathExists(path.join(defaultDir, 'CLAUDE.md'))).toBe(true);
    expect(await fs.pathExists(path.join(defaultDir, '.profile.json'))).toBe(true);
    expect(await fs.pathExists(path.join(defaultDir, '.git'))).toBe(true);
  });

  it('should create symlink from claudeDir to default profile', async () => {
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
    const stat = await fs.lstat(claudeDir);
    expect(stat.isSymbolicLink()).toBe(true);
    const target = await fs.readlink(claudeDir);
    expect(target).toBe(path.join(profilesDir, 'default'));
  });

  it('should create .ccp.json', async () => {
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
    const config = await fs.readJson(path.join(profilesDir, '.ccp.json'));
    expect(config.active).toBe('default');
    expect(config.profiles).toEqual(['default']);
  });

  it('should create backup of original claude dir', async () => {
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
    const entries = await fs.readdir(tempDir);
    const backups = entries.filter(e => e.startsWith('.claude-backup-'));
    expect(backups.length).toBe(1);
  });

  it('should refuse if already initialized', async () => {
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
    await expect(runInit({ claudeDir, profilesDir, skipConfirm: true })).rejects.toThrow(/already initialized/i);
  });
});
