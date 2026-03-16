import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir, createMockClaudeDir } from '../helpers/setup';
import { runInit } from '../../src/commands/init';
import { runCreate } from '../../src/commands/create';
import { runActivate } from '../../src/commands/activate';
import { runList } from '../../src/commands/list';
import { runInfo } from '../../src/commands/info';
import { runDelete } from '../../src/commands/delete';
import { runRename } from '../../src/commands/rename';
import { runCopy } from '../../src/commands/copy';

describe('CRUD commands', () => {
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

  describe('list', () => {
    it('should return all profiles', async () => {
      await runCreate({ name: 'work', profilesDir, skipPrompts: true, importItems: [] });
      const profiles = await runList({ profilesDir });
      expect(profiles).toContain('default');
      expect(profiles).toContain('work');
    });
  });

  describe('info', () => {
    it('should display profile info without error', async () => {
      await expect(runInfo({ name: 'default', profilesDir })).resolves.not.toThrow();
    });

    it('should throw for nonexistent profile', async () => {
      await expect(runInfo({ name: 'nope', profilesDir })).rejects.toThrow(/not found/i);
    });
  });

  describe('delete', () => {
    it('should delete a non-active profile', async () => {
      await runCreate({ name: 'temp', profilesDir, skipPrompts: true, importItems: [] });
      await runDelete({ name: 'temp', profilesDir, skipConfirm: true });
      expect(await fs.pathExists(path.join(profilesDir, 'temp'))).toBe(false);
      const config = await fs.readJson(path.join(profilesDir, '.ccp.json'));
      expect(config.profiles).not.toContain('temp');
    });

    it('should refuse to delete default profile', async () => {
      await expect(runDelete({ name: 'default', profilesDir, skipConfirm: true })).rejects.toThrow(/cannot delete.*default/i);
    });

    it('should refuse to delete active profile', async () => {
      await runCreate({ name: 'work', profilesDir, skipPrompts: true, importItems: [] });
      await runActivate({ name: 'work', claudeDir, profilesDir, skipConfirm: true, force: true });
      await expect(runDelete({ name: 'work', profilesDir, skipConfirm: true })).rejects.toThrow(/active/i);
    });
  });

  describe('rename', () => {
    it('should rename a profile', async () => {
      await runCreate({ name: 'old', profilesDir, skipPrompts: true, importItems: [] });
      await runRename({ oldName: 'old', newName: 'new-name', claudeDir, profilesDir });
      expect(await fs.pathExists(path.join(profilesDir, 'new-name'))).toBe(true);
      expect(await fs.pathExists(path.join(profilesDir, 'old'))).toBe(false);
      const config = await fs.readJson(path.join(profilesDir, '.ccp.json'));
      expect(config.profiles).toContain('new-name');
      expect(config.profiles).not.toContain('old');
    });

    it('should update symlink when renaming active profile', async () => {
      await runRename({ oldName: 'default', newName: 'main', claudeDir, profilesDir });
      const target = await fs.readlink(claudeDir);
      expect(target).toBe(path.join(profilesDir, 'main'));
      const config = await fs.readJson(path.join(profilesDir, '.ccp.json'));
      expect(config.active).toBe('main');
    });

    it('should reject invalid new name', async () => {
      await expect(runRename({ oldName: 'default', newName: '.bad', claudeDir, profilesDir })).rejects.toThrow();
    });

    it('should reject if target name exists', async () => {
      await runCreate({ name: 'work', profilesDir, skipPrompts: true, importItems: [] });
      await expect(runRename({ oldName: 'default', newName: 'work', claudeDir, profilesDir })).rejects.toThrow(/already exists/i);
    });
  });

  describe('copy', () => {
    it('should copy a profile', async () => {
      await runCopy({ sourceName: 'default', targetName: 'clone', profilesDir });
      const cloneDir = path.join(profilesDir, 'clone');
      expect(await fs.pathExists(cloneDir)).toBe(true);
      expect(await fs.pathExists(path.join(cloneDir, '.profile.json'))).toBe(true);
      expect(await fs.pathExists(path.join(cloneDir, '.git'))).toBe(true);
      const config = await fs.readJson(path.join(profilesDir, '.ccp.json'));
      expect(config.profiles).toContain('clone');
    });

    it('should reject if target exists', async () => {
      await expect(runCopy({ sourceName: 'default', targetName: 'default', profilesDir })).rejects.toThrow(/already exists/i);
    });

    it('should reject if source not found', async () => {
      await expect(runCopy({ sourceName: 'nope', targetName: 'clone', profilesDir })).rejects.toThrow(/not found/i);
    });
  });
});
