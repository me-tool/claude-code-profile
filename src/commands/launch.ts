import { spawnSync } from 'node:child_process';
import { log } from '../utils/logger';
import { resolveProfileDir } from '../core/profile';

interface LaunchOptions {
  name: string;
  profilesDir?: string;
}

export async function runLaunch(options: LaunchOptions): Promise<void> {
  const targetDir = await resolveProfileDir(options.name, options.profilesDir);

  log.info(`Launching claude with profile "${options.name}"`);
  log.step(`CLAUDE_CONFIG_DIR=${targetDir}`);
  spawnSync('claude', [], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: targetDir },
    stdio: 'inherit',
  });
}
