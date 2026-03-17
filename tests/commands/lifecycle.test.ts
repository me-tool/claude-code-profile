import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir, createMockClaudeDir } from '../helpers/setup';
import { runInit } from '../../src/commands/init';
import { runPause } from '../../src/commands/pause';
import { runResume } from '../../src/commands/resume';
import { runUninstall } from '../../src/commands/uninstall';
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

  describe('uninstall', () => {
    it('should restore ~/.claude and keep profiles dir', async () => {
      await runUninstall({ claudeDir, profilesDir, skipConfirm: true, force: true });
      expect(await isSymlink(claudeDir)).toBe(false);
      expect(await fs.pathExists(path.join(claudeDir, 'CLAUDE.md'))).toBe(true);
      expect(await fs.pathExists(profilesDir)).toBe(true);
    });
  });
});
