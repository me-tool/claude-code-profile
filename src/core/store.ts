import path from 'node:path';
import fs from 'fs-extra';
import { isSymlink } from './symlink';
import { log } from '../utils/logger';
import { CCP_HOME } from './paths';
import type { CcpConfig } from './config';

/**
 * Resolve the shared store directory path.
 * Priority: config.store > CCP_STORE env > profilesDir/.store
 */
export function resolveStoreDir(config?: Pick<CcpConfig, 'store'>, profilesDir?: string): string {
  if (config?.store) return config.store;
  if (process.env.CCP_STORE) return process.env.CCP_STORE;
  return path.join(profilesDir || CCP_HOME, '.store');
}

/**
 * Convenience wrapper: migrate both plugins and marketplaces to store.
 */
export async function syncProfileToStore(profileDir: string, storeDir: string): Promise<void> {
  await fs.ensureDir(path.join(storeDir, 'cache'));
  await migratePluginsToStore(profileDir, storeDir);
  await migrateMarketplacesToStore(profileDir, storeDir);
}

/**
 * Walk plugins/cache/ two-level directory structure, calling fn for each plugin entry.
 */
async function walkPluginCache(
  cacheDir: string,
  fn: (pluginPath: string, marketplace: string, plugin: string) => Promise<void>,
): Promise<void> {
  if (!await fs.pathExists(cacheDir)) return;
  const marketplaces = await fs.readdir(cacheDir);
  for (const marketplace of marketplaces) {
    const marketplaceDir = path.join(cacheDir, marketplace);
    const stat = await fs.lstat(marketplaceDir);
    if (stat.isSymbolicLink()) continue;
    if (!stat.isDirectory()) continue;
    const plugins = await fs.readdir(marketplaceDir);
    for (const plugin of plugins) {
      await fn(path.join(marketplaceDir, plugin), marketplace, plugin);
    }
  }
}

/**
 * Migrate non-symlink plugin dirs from profile's plugins/cache/ to shared store.
 * Uses temp-symlink + rename for atomicity — original is not removed until symlink is verified.
 */
export async function migratePluginsToStore(profileDir: string, storeDir: string): Promise<void> {
  const cacheDir = path.join(profileDir, 'plugins', 'cache');
  const errors: string[] = [];

  await walkPluginCache(cacheDir, async (pluginPath, marketplace, plugin) => {
    if (await isSymlink(pluginPath)) return;
    const storePath = path.join(storeDir, 'cache', marketplace, plugin);
    try {
      if (await fs.pathExists(storePath)) {
        await mergePluginVersions(pluginPath, storePath);
      } else {
        await fs.copy(pluginPath, storePath, { preserveTimestamps: true });
      }
      // Atomic swap: create temp symlink first to verify it works, then remove original and rename
      const tmpLink = `${pluginPath}.tmp.${process.pid}`;
      await fs.symlink(storePath, tmpLink);
      await fs.remove(pluginPath);
      await fs.rename(tmpLink, pluginPath);
    } catch (err: any) {
      errors.push(`${marketplace}/${plugin}: ${err.message}`);
    }
  });

  if (errors.length > 0) {
    log.warn(`Failed to migrate ${errors.length} plugin(s):\n${errors.map(e => `  - ${e}`).join('\n')}`);
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
 * If store already has marketplaces, merges top-level entries (store wins on conflicts).
 */
export async function migrateMarketplacesToStore(profileDir: string, storeDir: string): Promise<void> {
  const mpDir = path.join(profileDir, 'plugins', 'marketplaces');
  if (!await fs.pathExists(mpDir) || await isSymlink(mpDir)) return;

  const storeMpDir = path.join(storeDir, 'marketplaces');
  try {
    if (!await fs.pathExists(storeMpDir)) {
      await fs.copy(mpDir, storeMpDir, { preserveTimestamps: true });
    } else {
      // Merge: copy top-level entries that don't exist in store
      const entries = await fs.readdir(mpDir);
      for (const entry of entries) {
        const dst = path.join(storeMpDir, entry);
        if (!await fs.pathExists(dst)) {
          await fs.copy(path.join(mpDir, entry), dst, { preserveTimestamps: true });
        }
      }
    }
    // Atomic swap
    const tmpLink = `${mpDir}.tmp.${process.pid}`;
    await fs.symlink(storeMpDir, tmpLink);
    await fs.remove(mpDir);
    await fs.rename(tmpLink, mpDir);
  } catch (err: any) {
    log.warn(`Failed to migrate marketplaces: ${err.message}`);
  }
}

/**
 * Replace all plugin symlinks with real directories (copy from store).
 * Used by pause/uninstall/export to produce self-contained directories.
 * Returns list of dangling symlinks that could not be restored.
 */
export async function dereferencePlugins(dir: string): Promise<string[]> {
  const dangling: string[] = [];
  const cacheDir = path.join(dir, 'plugins', 'cache');

  await walkPluginCache(cacheDir, async (pluginPath) => {
    if (!await isSymlink(pluginPath)) return;
    const target = await fs.readlink(pluginPath);
    const resolved = path.resolve(path.dirname(pluginPath), target);
    if (!await fs.pathExists(resolved)) {
      dangling.push(pluginPath);
      log.warn(`Dangling symlink: ${pluginPath} -> ${target}, removing`);
      await fs.remove(pluginPath);
      return;
    }
    await fs.remove(pluginPath);
    await fs.copy(resolved, pluginPath, { preserveTimestamps: true });
  });

  const mpPath = path.join(dir, 'plugins', 'marketplaces');
  if (await isSymlink(mpPath)) {
    const target = await fs.readlink(mpPath);
    const resolved = path.resolve(path.dirname(mpPath), target);
    if (await fs.pathExists(resolved)) {
      await fs.remove(mpPath);
      await fs.copy(resolved, mpPath, { preserveTimestamps: true });
    } else {
      dangling.push(mpPath);
      log.warn(`Dangling symlink: ${mpPath}, removing`);
      await fs.remove(mpPath);
    }
  }

  return dangling;
}

/**
 * Find store cache entries not referenced by any profile's symlinks.
 */
export async function findOrphanedStoreEntries(storeDir: string, profileDirs: string[]): Promise<string[]> {
  const referenced = new Set<string>();
  for (const profileDir of profileDirs) {
    const cacheDir = path.join(profileDir, 'plugins', 'cache');
    await walkPluginCache(cacheDir, async (pluginPath) => {
      if (await isSymlink(pluginPath)) {
        const target = await fs.readlink(pluginPath);
        referenced.add(path.resolve(path.dirname(pluginPath), target));
      }
    });
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
