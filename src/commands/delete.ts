import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { readConfig, removeProfile } from '../core/config';
import { validateProfileName } from '../core/profile';
import { acquireLock } from '../core/lock';
import { PROFILES_DIR } from '../core/paths';

interface DeleteOptions {
  name: string;
  profilesDir?: string;
  skipConfirm?: boolean;
}

export async function runDelete(options: DeleteOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const lockFile = path.join(profiles, '.ccp.lock');
  const targetDir = path.join(profiles, options.name);

  const nameCheck = validateProfileName(options.name);
  if (!nameCheck.valid) throw new Error(`Invalid profile name: ${nameCheck.reason}`);
  if (options.name === 'default') throw new Error('Cannot delete the default profile');
  if (!(await fs.pathExists(targetDir))) throw new Error(`Profile "${options.name}" not found`);

  const config = await readConfig(configFile);
  if (config.active === options.name) throw new Error(`Cannot delete the active profile "${options.name}". Switch to another profile first.`);

  if (!options.skipConfirm) {
    const { confirmAction } = await import('../ui/prompts.js');
    const confirmed = await confirmAction(`Delete profile "${options.name}"? This cannot be undone.`);
    if (!confirmed) { log.info('Cancelled.'); return; }
  }

  const release = await acquireLock(lockFile);
  try {
    log.step(`Removing profile "${options.name}"...`);
    await fs.remove(targetDir);
    await removeProfile(configFile, options.name);
    log.success(`Profile "${options.name}" deleted`);
  } finally {
    await release();
  }
}
