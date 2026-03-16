import path from 'node:path';
import fs from 'fs-extra';
import { spawnSync } from 'node:child_process';
import { log } from '../utils/logger';
import { readConfig } from '../core/config';
import { validateProfileName } from '../core/profile';
import { PROFILES_DIR } from '../core/paths';

interface LaunchOptions {
  name: string;
  profilesDir?: string;
}

export async function runLaunch(options: LaunchOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const targetDir = path.join(profiles, options.name);
  const nameCheck = validateProfileName(options.name);
  if (!nameCheck.valid) throw new Error(`Invalid profile name: ${nameCheck.reason}`);
  if (!(await fs.pathExists(targetDir))) throw new Error(`Profile "${options.name}" not found`);

  const config = await readConfig(path.join(profiles, '.ccp.json'));
  if (config.active === options.name) {
    log.warn(`Profile "${options.name}" is already active via symlink. Use 'claude' directly.`);
    return;
  }

  log.info(`Launching claude with profile "${options.name}"`);
  log.step(`CLAUDE_CONFIG_DIR=${targetDir}`);
  spawnSync('claude', [], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: targetDir },
    stdio: 'inherit',
  });
}
