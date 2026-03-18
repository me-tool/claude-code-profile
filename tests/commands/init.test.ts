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
    const entries = await fs.readdir(profilesDir);
    const backups = entries.filter(e => e.startsWith('.backup-'));
    expect(backups.length).toBe(1);
  });

  it('should create plugin store and migrate plugins', async () => {
    // Add plugins to mock claude dir before init
    const pluginDir = path.join(claudeDir, 'plugins', 'cache', 'official', 'test-plugin');
    await fs.ensureDir(path.join(pluginDir, '1.0'));
    await fs.writeFile(path.join(pluginDir, '1.0', 'plugin.json'), '{}');

    await runInit({ claudeDir, profilesDir, skipConfirm: true });

    const storeDir = path.join(profilesDir, '.store');
    // Store should exist with plugin
    expect(await fs.pathExists(path.join(storeDir, 'cache', 'official', 'test-plugin', '1.0', 'plugin.json'))).toBe(true);

    // Profile plugin should be symlink to store
    const profilePlugin = path.join(profilesDir, 'default', 'plugins', 'cache', 'official', 'test-plugin');
    expect((await fs.lstat(profilePlugin)).isSymbolicLink()).toBe(true);
    expect(await fs.readlink(profilePlugin)).toBe(path.join(storeDir, 'cache', 'official', 'test-plugin'));

    // Config should have store field
    const config = await fs.readJson(path.join(profilesDir, '.ccp.json'));
    expect(config.store).toBe(storeDir);
    expect(config.version).toBe(2);
  });

  it('should refuse if already initialized', async () => {
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
    await expect(runInit({ claudeDir, profilesDir, skipConfirm: true })).rejects.toThrow(/already initialized/i);
  });
});
