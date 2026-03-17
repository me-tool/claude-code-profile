import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir } from '../helpers/setup';
import { initGit, autoCommit, getHistory, rollbackTo } from '../../src/core/git';

describe('git', () => {
  let tempDir: string;
  let profileDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    profileDir = path.join(tempDir, 'profile');
    await fs.ensureDir(profileDir);
    await fs.writeFile(path.join(profileDir, 'CLAUDE.md'), '# Initial\n');
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should init git repo with initial commit', async () => {
    await initGit(profileDir, 'init default profile');
    expect(await fs.pathExists(path.join(profileDir, '.git'))).toBe(true);
  });

  it('should auto-commit changes', async () => {
    await initGit(profileDir, 'init');
    await fs.writeFile(path.join(profileDir, 'CLAUDE.md'), '# Changed\n');
    const committed = await autoCommit(profileDir, 'auto: test change');
    expect(committed).toBe(true);
  });

  it('should not commit when nothing changed', async () => {
    await initGit(profileDir, 'init');
    const committed = await autoCommit(profileDir, 'auto: no change');
    expect(committed).toBe(false);
  });

  it('should create snapshot with custom prefix', async () => {
    await initGit(profileDir, 'init');
    await fs.writeFile(path.join(profileDir, 'CLAUDE.md'), '# Snapshot\n');
    await autoCommit(profileDir, 'manual snapshot', 'snapshot');
    const history = await getHistory(profileDir, 5);
    expect(history[0].message).toBe('snapshot: manual snapshot');
  });

  it('should use default ccp prefix', async () => {
    await initGit(profileDir, 'init');
    await fs.writeFile(path.join(profileDir, 'CLAUDE.md'), '# Changed2\n');
    await autoCommit(profileDir, 'test change');
    const history = await getHistory(profileDir, 5);
    expect(history[0].message).toBe('ccp: test change');
  });

  it('should return false on snapshot with no changes', async () => {
    await initGit(profileDir, 'init');
    const committed = await autoCommit(profileDir, 'nothing');
    expect(committed).toBe(false);
  });

  it('should get history', async () => {
    await initGit(profileDir, 'init');
    const history = await getHistory(profileDir, 10);
    expect(history.length).toBe(1);
    expect(history[0].message).toContain('init');
  });

  it('should rollback to previous commit', async () => {
    await initGit(profileDir, 'init');
    await fs.writeFile(path.join(profileDir, 'CLAUDE.md'), '# V2\n');
    await autoCommit(profileDir, 'version 2');
    const history = await getHistory(profileDir, 10);
    const initCommit = history[history.length - 1].hash;
    await rollbackTo(profileDir, initCommit);
    const content = await fs.readFile(path.join(profileDir, 'CLAUDE.md'), 'utf8');
    expect(content).toBe('# Initial\n');
    const newHistory = await getHistory(profileDir, 10);
    expect(newHistory.length).toBe(3);
  });
});
