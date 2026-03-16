import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { readConfig } from '../core/config';
import { readProfileMeta, validateProfileName } from '../core/profile';
import { getDirSize } from '../utils/fs';
import { PROFILES_DIR } from '../core/paths';

interface InfoOptions {
  name: string;
  profilesDir?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function runInfo(options: InfoOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const profileDir = path.join(profiles, options.name);
  const configFile = path.join(profiles, '.ccp.json');

  const nameCheck = validateProfileName(options.name);
  if (!nameCheck.valid) throw new Error(`Invalid profile name: ${nameCheck.reason}`);
  if (!(await fs.pathExists(profileDir))) throw new Error(`Profile "${options.name}" not found`);

  const config = await readConfig(configFile);
  const metaPath = path.join(profileDir, '.profile.json');
  const meta = await readProfileMeta(metaPath);
  const size = await getDirSize(profileDir);

  log.plain(`Profile: ${meta.name}`);
  log.plain(`Active: ${config.active === options.name ? 'yes' : 'no'}`);
  if (meta.description) log.plain(`Description: ${meta.description}`);
  log.plain(`Created: ${meta.createdAt}`);
  if (meta.importedFrom) log.plain(`Imported from: ${meta.importedFrom}`);
  if (meta.importedItems?.length) log.plain(`Imported items: ${meta.importedItems.join(', ')}`);
  log.plain(`Size: ${formatSize(size)}`);
}
