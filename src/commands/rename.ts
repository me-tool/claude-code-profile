import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { readConfig, writeConfig } from '../core/config';
import { readProfileMeta, writeProfileMeta, validateProfileName } from '../core/profile';
import { switchSymlink, isSymlink } from '../core/symlink';
import { acquireLock } from '../core/lock';
import { PROFILES_DIR, CLAUDE_DIR } from '../core/paths';

interface RenameOptions {
  oldName: string;
  newName: string;
  claudeDir?: string;
  profilesDir?: string;
}

export async function runRename(options: RenameOptions): Promise<void> {
  const claude = options.claudeDir ?? CLAUDE_DIR;
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const lockFile = path.join(profiles, '.ccp.lock');
  const sourceDir = path.join(profiles, options.oldName);
  const targetDir = path.join(profiles, options.newName);

  const nameCheck = validateProfileName(options.newName);
  if (!nameCheck.valid) throw new Error(`Invalid profile name: ${nameCheck.reason}`);
  if (!(await fs.pathExists(sourceDir))) throw new Error(`Profile "${options.oldName}" not found`);
  if (await fs.pathExists(targetDir)) throw new Error(`Profile "${options.newName}" already exists`);

  const release = await acquireLock(lockFile);
  try {
    log.step(`Renaming "${options.oldName}" to "${options.newName}"...`);
    await fs.rename(sourceDir, targetDir);

    // Update profile meta
    const metaPath = path.join(targetDir, '.profile.json');
    const meta = await readProfileMeta(metaPath);
    meta.name = options.newName;
    await writeProfileMeta(metaPath, meta);

    // Update config
    const config = await readConfig(configFile);
    config.profiles = config.profiles.map(p => p === options.oldName ? options.newName : p);
    if (config.active === options.oldName) {
      config.active = options.newName;
      // Update symlink if renaming the active profile
      if (await isSymlink(claude)) {
        await switchSymlink(targetDir, claude);
      }
    }
    await writeConfig(configFile, config);

    log.success(`Profile renamed: ${options.oldName} -> ${options.newName}`);
  } finally {
    await release();
  }
}
