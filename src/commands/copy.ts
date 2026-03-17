import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { readConfig, addProfile } from '../core/config';
import { copyDir } from '../utils/fs';
import { createProfileMeta, writeProfileMeta, validateProfileName } from '../core/profile';
import { initGit } from '../core/git';
import { migratePluginsToStore, migrateMarketplacesToStore } from '../core/store';
import { PROFILES_DIR } from '../core/paths';

interface CopyOptions {
  sourceName: string;
  targetName: string;
  profilesDir?: string;
  description?: string;
}

export async function runCopy(options: CopyOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const sourceDir = path.join(profiles, options.sourceName);
  const targetDir = path.join(profiles, options.targetName);

  const nameCheck = validateProfileName(options.targetName);
  if (!nameCheck.valid) throw new Error(`Invalid profile name: ${nameCheck.reason}`);
  if (!(await fs.pathExists(sourceDir))) throw new Error(`Source profile "${options.sourceName}" not found`);
  if (await fs.pathExists(targetDir)) throw new Error(`Profile "${options.targetName}" already exists`);

  log.step(`Copying "${options.sourceName}" to "${options.targetName}"...`);
  await copyDir(sourceDir, targetDir);

  // Remove old git history and re-init
  await fs.remove(path.join(targetDir, '.git'));

  // Re-migrate plugins to store
  const config = await readConfig(configFile);
  if (config.store) {
    await migratePluginsToStore(targetDir, config.store);
    await migrateMarketplacesToStore(targetDir, config.store);
  }

  const meta = createProfileMeta(options.targetName, {
    description: options.description,
    importedFrom: options.sourceName,
  });
  await writeProfileMeta(path.join(targetDir, '.profile.json'), meta);

  log.step('Initializing version control...');
  await initGit(targetDir, `init profile "${options.targetName}" (copied from "${options.sourceName}")`);
  await addProfile(configFile, options.targetName);

  log.success(`Profile "${options.targetName}" created (copied from "${options.sourceName}")`);
}
