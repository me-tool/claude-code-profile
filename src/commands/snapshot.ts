import path from 'node:path';
import { log } from '../utils/logger';
import { autoCommit } from '../core/git';
import { readConfig } from '../core/config';
import { resolveProfileDir } from '../core/profile';
import { migratePluginsToStore, migrateMarketplacesToStore } from '../core/store';
import { PROFILES_DIR } from '../core/paths';

interface SnapshotOptions {
  name: string;
  message?: string;
  profilesDir?: string;
}

export async function runSnapshot(options: SnapshotOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const dir = await resolveProfileDir(options.name, options.profilesDir);

  const config = await readConfig(configFile);
  if (config.store) {
    await migratePluginsToStore(dir, config.store);
    await migrateMarketplacesToStore(dir, config.store);
  }

  const msg = options.message ?? `manual snapshot ${new Date().toISOString()}`;
  const committed = await autoCommit(dir, msg, 'snapshot');
  if (committed) log.success(`Snapshot created for "${options.name}"`);
  else log.info(`No changes to snapshot for "${options.name}"`);
}
