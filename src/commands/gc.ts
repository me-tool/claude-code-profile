import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { readConfig } from '../core/config';
import { findOrphanedStoreEntries } from '../core/store';
import { PROFILES_DIR } from '../core/paths';

interface GcOptions {
  profilesDir?: string;
  skipConfirm?: boolean;
}

export async function runGc(options: GcOptions = {}): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const config = await readConfig(configFile);

  if (!config.store) {
    log.info('Plugin store not configured.');
    return;
  }

  const profileDirs = config.profiles.map(n => path.join(profiles, n));
  const orphans = await findOrphanedStoreEntries(config.store, profileDirs);

  if (orphans.length === 0) {
    log.success('No orphaned plugins in store.');
    return;
  }

  log.info(`Found ${orphans.length} orphaned plugin(s):`);
  for (const orphan of orphans) {
    log.plain(`  - ${path.relative(config.store, orphan)}`);
  }

  if (!options.skipConfirm) {
    const { confirmAction } = await import('../ui/prompts.js');
    const confirmed = await confirmAction(`Delete ${orphans.length} orphaned plugin(s)?`);
    if (!confirmed) { log.info('Cancelled.'); return; }
  }

  for (const orphan of orphans) {
    await fs.remove(orphan);
  }

  // Clean up empty marketplace directories in store cache
  const storeCacheDir = path.join(config.store, 'cache');
  if (await fs.pathExists(storeCacheDir)) {
    const marketplaces = await fs.readdir(storeCacheDir);
    for (const marketplace of marketplaces) {
      const mpDir = path.join(storeCacheDir, marketplace);
      const remaining = await fs.readdir(mpDir);
      if (remaining.length === 0) {
        await fs.rmdir(mpDir).catch(() => {});
      }
    }
  }

  log.success(`Removed ${orphans.length} orphaned plugin(s).`);
}
