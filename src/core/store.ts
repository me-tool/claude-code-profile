import path from 'node:path';
import fs from 'fs-extra';
import { isSymlink } from './symlink';
import { log } from '../utils/logger';

/**
 * Convenience wrapper: migrate both plugins and marketplaces to store.
 * No-op if storeDir is undefined (store not configured).
 */
export async function syncProfileToStore(profileDir: string, storeDir?: string): Promise<void> {
  if (!storeDir) return;
  await migratePluginsToStore(profileDir, storeDir);
  await migrateMarketplacesToStore(profileDir, storeDir);
}

/**
 * Migrate non-symlink plugin dirs from profile's plugins/cache/ to shared store.
 * Each plugin-name dir (e.g., superpowers/) becomes a symlink to the store.
 */
export async function migratePluginsToStore(profileDir: string, storeDir: string): Promise<void> {
  const cacheDir = path.join(profileDir, 'plugins', 'cache');
  if (!await fs.pathExists(cacheDir)) return;

  const marketplaces = await fs.readdir(cacheDir);
  for (const marketplace of marketplaces) {
    const marketplaceDir = path.join(cacheDir, marketplace);
    const stat = await fs.lstat(marketplaceDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;

    const plugins = await fs.readdir(marketplaceDir);
    for (const plugin of plugins) {
      const pluginPath = path.join(marketplaceDir, plugin);
      if (await isSymlink(pluginPath)) continue;

      const storePath = path.join(storeDir, 'cache', marketplace, plugin);

      if (await fs.pathExists(storePath)) {
        await mergePluginVersions(pluginPath, storePath);
      } else {
        await fs.copy(pluginPath, storePath, { preserveTimestamps: true });
      }

      await fs.remove(pluginPath);
      await fs.symlink(storePath, pluginPath);
    }
  }
}

async function mergePluginVersions(source: string, storeTarget: string): Promise<void> {
  const versions = await fs.readdir(source);
  for (const version of versions) {
    const srcVersion = path.join(source, version);
    const dstVersion = path.join(storeTarget, version);
    const stat = await fs.lstat(srcVersion);
    if (stat.isDirectory() && !await fs.pathExists(dstVersion)) {
      await fs.copy(srcVersion, dstVersion, { preserveTimestamps: true });
    }
  }
}

/**
 * Migrate marketplaces/ directory to shared store and replace with symlink.
 */
export async function migrateMarketplacesToStore(profileDir: string, storeDir: string): Promise<void> {
  const mpDir = path.join(profileDir, 'plugins', 'marketplaces');
  if (!await fs.pathExists(mpDir) || await isSymlink(mpDir)) return;

  const storeMpDir = path.join(storeDir, 'marketplaces');
  if (!await fs.pathExists(storeMpDir)) {
    await fs.copy(mpDir, storeMpDir, { preserveTimestamps: true });
  }
  await fs.remove(mpDir);
  await fs.symlink(storeMpDir, mpDir);
}

/**
 * Replace all plugin symlinks with real directories (copy from store).
 * Used by pause/uninstall/export to produce self-contained directories.
 */
export async function dereferencePlugins(dir: string): Promise<void> {
  const cacheDir = path.join(dir, 'plugins', 'cache');
  if (await fs.pathExists(cacheDir)) {
    const marketplaces = await fs.readdir(cacheDir);
    for (const marketplace of marketplaces) {
      const marketplaceDir = path.join(cacheDir, marketplace);
      const mpStat = await fs.lstat(marketplaceDir);
      if (!mpStat.isDirectory() || mpStat.isSymbolicLink()) continue;

      const plugins = await fs.readdir(marketplaceDir);
      for (const plugin of plugins) {
        const pluginPath = path.join(marketplaceDir, plugin);
        if (!await isSymlink(pluginPath)) continue;

        const target = await fs.readlink(pluginPath);
        if (!await fs.pathExists(target)) {
          log.warn(`Dangling symlink: ${pluginPath} -> ${target}, removing`);
          await fs.remove(pluginPath);
          continue;
        }
        await fs.remove(pluginPath);
        await fs.copy(target, pluginPath, { preserveTimestamps: true });
      }
    }
  }

  const mpPath = path.join(dir, 'plugins', 'marketplaces');
  if (await isSymlink(mpPath)) {
    const target = await fs.readlink(mpPath);
    if (await fs.pathExists(target)) {
      await fs.remove(mpPath);
      await fs.copy(target, mpPath, { preserveTimestamps: true });
    } else {
      log.warn(`Dangling symlink: ${mpPath}, removing`);
      await fs.remove(mpPath);
    }
  }
}

/**
 * Find store cache entries not referenced by any profile's symlinks.
 */
export async function findOrphanedStoreEntries(storeDir: string, profileDirs: string[]): Promise<string[]> {
  const referenced = new Set<string>();
  for (const profileDir of profileDirs) {
    const cacheDir = path.join(profileDir, 'plugins', 'cache');
    if (!await fs.pathExists(cacheDir)) continue;
    const marketplaces = await fs.readdir(cacheDir);
    for (const marketplace of marketplaces) {
      const marketplaceDir = path.join(cacheDir, marketplace);
      const stat = await fs.lstat(marketplaceDir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
      const plugins = await fs.readdir(marketplaceDir);
      for (const plugin of plugins) {
        const pluginPath = path.join(marketplaceDir, plugin);
        if (await isSymlink(pluginPath)) {
          const target = await fs.readlink(pluginPath);
          referenced.add(target);
        }
      }
    }
  }

  const orphans: string[] = [];
  const storeCacheDir = path.join(storeDir, 'cache');
  if (!await fs.pathExists(storeCacheDir)) return orphans;

  const storeMarketplaces = await fs.readdir(storeCacheDir);
  for (const marketplace of storeMarketplaces) {
    const marketplaceDir = path.join(storeCacheDir, marketplace);
    const stat = await fs.lstat(marketplaceDir);
    if (!stat.isDirectory()) continue;
    const plugins = await fs.readdir(marketplaceDir);
    for (const plugin of plugins) {
      const storePath = path.join(marketplaceDir, plugin);
      if (!referenced.has(storePath)) {
        orphans.push(storePath);
      }
    }
  }

  return orphans;
}
