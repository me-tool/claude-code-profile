import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir } from '../helpers/setup';
import { runGc } from '../../src/commands/gc';

describe('gc command', () => {
  let tmpDir: string;
  let profilesDir: string;
  let storeDir: string;

  beforeEach(async () => {
    tmpDir = await createTempDir('ccp-gc-test-');
    profilesDir = path.join(tmpDir, 'profiles');
    storeDir = path.join(tmpDir, 'profiles', '.store');
    await fs.ensureDir(storeDir);
  });

  afterEach(async () => { await cleanupTempDir(tmpDir); });

  it('should delete orphaned store entries', async () => {
    const storeA = path.join(storeDir, 'cache', 'official', 'superpowers');
    const storeB = path.join(storeDir, 'cache', 'official', 'orphan');
    await fs.ensureDir(path.join(storeA, '1.0'));
    await fs.ensureDir(path.join(storeB, '1.0'));

    const profileDir = path.join(profilesDir, 'default');
    const cacheDir = path.join(profileDir, 'plugins', 'cache', 'official');
    await fs.ensureDir(cacheDir);
    await fs.symlink(storeA, path.join(cacheDir, 'superpowers'));

    await fs.writeJson(path.join(profilesDir, '.ccp.json'), {
      version: 2, active: 'default', profiles: ['default'],
      createdAt: new Date().toISOString(), store: storeDir,
    });

    await runGc({ profilesDir, skipConfirm: true });

    expect(await fs.pathExists(storeB)).toBe(false);
    expect(await fs.pathExists(storeA)).toBe(true);
  });

  it('should do nothing when no orphans exist', async () => {
    const storeA = path.join(storeDir, 'cache', 'official', 'superpowers');
    await fs.ensureDir(path.join(storeA, '1.0'));

    const profileDir = path.join(profilesDir, 'default');
    const cacheDir = path.join(profileDir, 'plugins', 'cache', 'official');
    await fs.ensureDir(cacheDir);
    await fs.symlink(storeA, path.join(cacheDir, 'superpowers'));

    await fs.writeJson(path.join(profilesDir, '.ccp.json'), {
      version: 2, active: 'default', profiles: ['default'],
      createdAt: new Date().toISOString(), store: storeDir,
    });

    await runGc({ profilesDir, skipConfirm: true });

    expect(await fs.pathExists(storeA)).toBe(true);
  });

  it('should not delete entries referenced by any profile', async () => {
    const storePlugin = path.join(storeDir, 'cache', 'official', 'shared-plugin');
    await fs.ensureDir(path.join(storePlugin, '1.0'));

    // Both profiles reference the same store entry
    for (const name of ['default', 'work']) {
      const cacheDir = path.join(profilesDir, name, 'plugins', 'cache', 'official');
      await fs.ensureDir(cacheDir);
      await fs.symlink(storePlugin, path.join(cacheDir, 'shared-plugin'));
    }

    await fs.writeJson(path.join(profilesDir, '.ccp.json'), {
      version: 2, active: 'default', profiles: ['default', 'work'],
      createdAt: new Date().toISOString(), store: storeDir,
    });

    await runGc({ profilesDir, skipConfirm: true });

    // Should still exist — referenced by both profiles
    expect(await fs.pathExists(storePlugin)).toBe(true);
  });

  it('should clean up empty marketplace directories', async () => {
    const storeOrphan = path.join(storeDir, 'cache', 'empty-marketplace', 'orphan');
    await fs.ensureDir(path.join(storeOrphan, '1.0'));

    const profileDir = path.join(profilesDir, 'default');
    await fs.ensureDir(path.join(profileDir, 'plugins', 'cache'));

    await fs.writeJson(path.join(profilesDir, '.ccp.json'), {
      version: 2, active: 'default', profiles: ['default'],
      createdAt: new Date().toISOString(), store: storeDir,
    });

    await runGc({ profilesDir, skipConfirm: true });

    expect(await fs.pathExists(path.join(storeDir, 'cache', 'empty-marketplace'))).toBe(false);
  });
});
