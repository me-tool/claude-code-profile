import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir, createMockClaudeDir } from '../helpers/setup';
import { runInit } from '../../src/commands/init';
import { runPause } from '../../src/commands/pause';
import { runResume } from '../../src/commands/resume';
import { runUninstall } from '../../src/commands/uninstall';
import { runCreate } from '../../src/commands/create';
import { isSymlink } from '../../src/core/symlink';

describe('lifecycle commands', () => {
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

  describe('pause', () => {
    it('should restore ~/.claude as real directory', async () => {
      await runPause({ claudeDir, profilesDir, skipConfirm: true, force: true });
      expect(await isSymlink(claudeDir)).toBe(false);
      expect(await fs.pathExists(path.join(claudeDir, 'CLAUDE.md'))).toBe(true);
    });

    it('should preserve profiles directory', async () => {
      await runPause({ claudeDir, profilesDir, skipConfirm: true, force: true });
      expect(await fs.pathExists(profilesDir)).toBe(true);
    });
  });

  describe('resume', () => {
    it('should re-establish symlink after pause', async () => {
      await runPause({ claudeDir, profilesDir, skipConfirm: true, force: true });
      await runResume({ claudeDir, profilesDir, skipConfirm: true });
      expect(await isSymlink(claudeDir)).toBe(true);
    });
  });

  describe('plugin store lifecycle', () => {
    it('should maintain store consistency across init → create → pause → resume', async () => {
      // Add plugins to the initialized default profile
      const defaultPluginDir = path.join(profilesDir, 'default', 'plugins', 'cache', 'official', 'test-plugin');
      await fs.ensureDir(path.join(defaultPluginDir, '1.0'));
      await fs.writeFile(path.join(defaultPluginDir, '1.0', 'plugin.json'), '{}');

      const storeDir = path.join(profilesDir, '.store');

      // Create clone — should trigger migration of new plugin to store
      await runCreate({ name: 'work', from: 'default', profilesDir, skipPrompts: true });

      // Store should have the plugin
      expect(await fs.pathExists(path.join(storeDir, 'cache', 'official', 'test-plugin', '1.0', 'plugin.json'))).toBe(true);

      // Work profile should have symlink
      const workPlugin = path.join(profilesDir, 'work', 'plugins', 'cache', 'official', 'test-plugin');
      expect((await fs.lstat(workPlugin)).isSymbolicLink()).toBe(true);

      // Pause — should dereference
      await runPause({ claudeDir, profilesDir, skipConfirm: true, force: true });
      const pausedPlugin = path.join(claudeDir, 'plugins', 'cache', 'official', 'test-plugin');
      expect(await fs.pathExists(pausedPlugin)).toBe(true);
      expect((await fs.lstat(pausedPlugin)).isSymbolicLink()).toBe(false);

      // Resume — should re-migrate
      await runResume({ claudeDir, profilesDir, skipConfirm: true });
      const resumedPlugin = path.join(profilesDir, 'default', 'plugins', 'cache', 'official', 'test-plugin');
      expect(await fs.pathExists(resumedPlugin)).toBe(true);
      expect((await fs.lstat(resumedPlugin)).isSymbolicLink()).toBe(true);

      // Store still intact
      expect(await fs.pathExists(path.join(storeDir, 'cache', 'official', 'test-plugin', '1.0', 'plugin.json'))).toBe(true);
    });
  });

  describe('uninstall', () => {
    it('should restore ~/.claude and keep profiles dir', async () => {
      await runUninstall({ claudeDir, profilesDir, skipConfirm: true, force: true });
      expect(await isSymlink(claudeDir)).toBe(false);
      expect(await fs.pathExists(path.join(claudeDir, 'CLAUDE.md'))).toBe(true);
      expect(await fs.pathExists(profilesDir)).toBe(true);
    });
  });
});
