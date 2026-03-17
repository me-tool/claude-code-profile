import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir } from '../helpers/setup';
import {
  migratePluginsToStore,
  migrateMarketplacesToStore,
  dereferencePlugins,
  findOrphanedStoreEntries,
} from '../../src/core/store';

describe('store', () => {
  let tmpDir: string;
  let profileDir: string;
  let storeDir: string;

  beforeEach(async () => {
    tmpDir = await createTempDir('ccp-store-test-');
    profileDir = path.join(tmpDir, 'profile');
    storeDir = path.join(tmpDir, 'store');
    await fs.ensureDir(storeDir);
  });

  afterEach(async () => { await cleanupTempDir(tmpDir); });

  describe('migratePluginsToStore', () => {
    it('should move plugin dirs to store and replace with symlinks', async () => {
      const pluginDir = path.join(profileDir, 'plugins', 'cache', 'official', 'superpowers');
      await fs.ensureDir(path.join(pluginDir, '5.0.0'));
      await fs.writeFile(path.join(pluginDir, '5.0.0', 'plugin.json'), '{}');

      await migratePluginsToStore(profileDir, storeDir);

      const stat = await fs.lstat(pluginDir);
      expect(stat.isSymbolicLink()).toBe(true);
      const target = await fs.readlink(pluginDir);
      expect(target).toBe(path.join(storeDir, 'cache', 'official', 'superpowers'));
      expect(await fs.pathExists(path.join(storeDir, 'cache', 'official', 'superpowers', '5.0.0', 'plugin.json'))).toBe(true);
    });

    it('should skip entries that are already symlinks', async () => {
      const storePlugin = path.join(storeDir, 'cache', 'official', 'superpowers');
      await fs.ensureDir(path.join(storePlugin, '5.0.0'));
      await fs.ensureDir(path.join(profileDir, 'plugins', 'cache', 'official'));
      await fs.symlink(storePlugin, path.join(profileDir, 'plugins', 'cache', 'official', 'superpowers'));

      await migratePluginsToStore(profileDir, storeDir);

      const stat = await fs.lstat(path.join(profileDir, 'plugins', 'cache', 'official', 'superpowers'));
      expect(stat.isSymbolicLink()).toBe(true);
    });

    it('should merge versions when store already has the plugin', async () => {
      const storePlugin = path.join(storeDir, 'cache', 'official', 'context7');
      await fs.ensureDir(path.join(storePlugin, 'aaa'));
      await fs.writeFile(path.join(storePlugin, 'aaa', 'plugin.json'), '{"v":"aaa"}');

      const pluginDir = path.join(profileDir, 'plugins', 'cache', 'official', 'context7');
      await fs.ensureDir(path.join(pluginDir, 'aaa'));
      await fs.writeFile(path.join(pluginDir, 'aaa', 'plugin.json'), '{"v":"aaa"}');
      await fs.ensureDir(path.join(pluginDir, 'bbb'));
      await fs.writeFile(path.join(pluginDir, 'bbb', 'plugin.json'), '{"v":"bbb"}');

      await migratePluginsToStore(profileDir, storeDir);

      expect(await fs.pathExists(path.join(storePlugin, 'aaa', 'plugin.json'))).toBe(true);
      expect(await fs.pathExists(path.join(storePlugin, 'bbb', 'plugin.json'))).toBe(true);
      const stat = await fs.lstat(pluginDir);
      expect(stat.isSymbolicLink()).toBe(true);
    });

    it('should do nothing if plugins/cache does not exist', async () => {
      await fs.ensureDir(profileDir);
      await migratePluginsToStore(profileDir, storeDir);
    });
  });

  describe('migrateMarketplacesToStore', () => {
    it('should move marketplaces dir to store and replace with symlink', async () => {
      const mpDir = path.join(profileDir, 'plugins', 'marketplaces');
      await fs.ensureDir(path.join(mpDir, 'official'));
      await fs.writeFile(path.join(mpDir, 'official', 'index.json'), '{}');

      await migrateMarketplacesToStore(profileDir, storeDir);

      const stat = await fs.lstat(mpDir);
      expect(stat.isSymbolicLink()).toBe(true);
      expect(await fs.readlink(mpDir)).toBe(path.join(storeDir, 'marketplaces'));
      expect(await fs.pathExists(path.join(storeDir, 'marketplaces', 'official', 'index.json'))).toBe(true);
    });

    it('should skip if marketplaces is already a symlink', async () => {
      const storeMp = path.join(storeDir, 'marketplaces');
      await fs.ensureDir(storeMp);
      await fs.ensureDir(path.join(profileDir, 'plugins'));
      await fs.symlink(storeMp, path.join(profileDir, 'plugins', 'marketplaces'));

      await migrateMarketplacesToStore(profileDir, storeDir);

      const stat = await fs.lstat(path.join(profileDir, 'plugins', 'marketplaces'));
      expect(stat.isSymbolicLink()).toBe(true);
    });

    it('should not overwrite existing store marketplaces', async () => {
      await fs.ensureDir(path.join(storeDir, 'marketplaces', 'official'));
      await fs.writeFile(path.join(storeDir, 'marketplaces', 'official', 'existing.json'), '{}');

      const mpDir = path.join(profileDir, 'plugins', 'marketplaces', 'official');
      await fs.ensureDir(mpDir);
      await fs.writeFile(path.join(mpDir, 'index.json'), '{}');

      await migrateMarketplacesToStore(profileDir, storeDir);

      expect(await fs.pathExists(path.join(storeDir, 'marketplaces', 'official', 'existing.json'))).toBe(true);
    });
  });

  describe('dereferencePlugins', () => {
    it('should replace cache symlinks with real directories', async () => {
      const storePlugin = path.join(storeDir, 'cache', 'official', 'superpowers');
      await fs.ensureDir(path.join(storePlugin, '5.0.0'));
      await fs.writeFile(path.join(storePlugin, '5.0.0', 'plugin.json'), '{}');

      await fs.ensureDir(path.join(profileDir, 'plugins', 'cache', 'official'));
      await fs.symlink(storePlugin, path.join(profileDir, 'plugins', 'cache', 'official', 'superpowers'));

      await dereferencePlugins(profileDir);

      const pluginDir = path.join(profileDir, 'plugins', 'cache', 'official', 'superpowers');
      const stat = await fs.lstat(pluginDir);
      expect(stat.isSymbolicLink()).toBe(false);
      expect(stat.isDirectory()).toBe(true);
      expect(await fs.pathExists(path.join(pluginDir, '5.0.0', 'plugin.json'))).toBe(true);
    });

    it('should replace marketplaces symlink with real directory', async () => {
      const storeMp = path.join(storeDir, 'marketplaces');
      await fs.ensureDir(path.join(storeMp, 'official'));
      await fs.writeFile(path.join(storeMp, 'official', 'index.json'), '{}');

      await fs.ensureDir(path.join(profileDir, 'plugins'));
      await fs.symlink(storeMp, path.join(profileDir, 'plugins', 'marketplaces'));

      await dereferencePlugins(profileDir);

      const mpDir = path.join(profileDir, 'plugins', 'marketplaces');
      const stat = await fs.lstat(mpDir);
      expect(stat.isSymbolicLink()).toBe(false);
      expect(stat.isDirectory()).toBe(true);
      expect(await fs.pathExists(path.join(mpDir, 'official', 'index.json'))).toBe(true);
    });

    it('should remove dangling symlinks without error', async () => {
      await fs.ensureDir(path.join(profileDir, 'plugins', 'cache', 'official'));
      await fs.symlink('/nonexistent/path', path.join(profileDir, 'plugins', 'cache', 'official', 'ghost'));

      await dereferencePlugins(profileDir);

      expect(await fs.pathExists(path.join(profileDir, 'plugins', 'cache', 'official', 'ghost'))).toBe(false);
    });

    it('should skip non-symlink entries', async () => {
      const pluginDir = path.join(profileDir, 'plugins', 'cache', 'official', 'superpowers');
      await fs.ensureDir(path.join(pluginDir, '5.0.0'));
      await fs.writeFile(path.join(pluginDir, '5.0.0', 'plugin.json'), '{}');

      await dereferencePlugins(profileDir);

      const stat = await fs.lstat(pluginDir);
      expect(stat.isDirectory()).toBe(true);
      expect(stat.isSymbolicLink()).toBe(false);
    });
  });

  describe('findOrphanedStoreEntries', () => {
    it('should find store entries not referenced by any profile', async () => {
      const storeA = path.join(storeDir, 'cache', 'official', 'superpowers');
      const storeB = path.join(storeDir, 'cache', 'official', 'orphan');
      await fs.ensureDir(path.join(storeA, '1.0'));
      await fs.ensureDir(path.join(storeB, '1.0'));

      const cacheDir = path.join(profileDir, 'plugins', 'cache', 'official');
      await fs.ensureDir(cacheDir);
      await fs.symlink(storeA, path.join(cacheDir, 'superpowers'));

      const orphans = await findOrphanedStoreEntries(storeDir, [profileDir]);
      expect(orphans).toHaveLength(1);
      expect(orphans[0]).toBe(storeB);
    });

    it('should return empty when all entries are referenced', async () => {
      const storeA = path.join(storeDir, 'cache', 'official', 'superpowers');
      await fs.ensureDir(path.join(storeA, '1.0'));

      const cacheDir = path.join(profileDir, 'plugins', 'cache', 'official');
      await fs.ensureDir(cacheDir);
      await fs.symlink(storeA, path.join(cacheDir, 'superpowers'));

      const orphans = await findOrphanedStoreEntries(storeDir, [profileDir]);
      expect(orphans).toHaveLength(0);
    });
  });
});
