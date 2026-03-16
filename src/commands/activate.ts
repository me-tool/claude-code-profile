import path from 'node:path';
import fs from 'fs-extra';
import { execFileSync } from 'node:child_process';
import { log } from '../utils/logger';
import { readConfig, setActive } from '../core/config';
import { validateProfileName } from '../core/profile';
import { switchSymlink } from '../core/symlink';
import { autoCommit } from '../core/git';
import { acquireLock } from '../core/lock';
import { PROFILES_DIR, CLAUDE_DIR } from '../core/paths';

function isClaudeRunning(): boolean {
  try {
    execFileSync('pgrep', ['-x', 'claude'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

interface ActivateOptions {
  name: string;
  claudeDir?: string;
  profilesDir?: string;
  skipConfirm?: boolean;
  force?: boolean;
}

export async function runActivate(options: ActivateOptions): Promise<void> {
  const claude = options.claudeDir ?? CLAUDE_DIR;
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const lockFile = path.join(profiles, '.ccp.lock');
  const targetDir = path.join(profiles, options.name);

  const nameCheck = validateProfileName(options.name);
  if (!nameCheck.valid) throw new Error(`Invalid profile name: ${nameCheck.reason}`);
  if (!(await fs.pathExists(targetDir))) throw new Error(`Profile "${options.name}" not found`);

  if (isClaudeRunning() && !options.force) {
    log.warn('Claude Code appears to be running.');
    throw new Error('Claude is running. Use --force to override.');
  }

  const config = await readConfig(configFile);
  if (config.active === options.name) {
    log.info(`Already active`);
    return;
  }

  const release = await acquireLock(lockFile);
  try {
    const currentDir = path.join(profiles, config.active);
    log.step(`Snapshotting "${config.active}"...`);
    await autoCommit(currentDir, 'auto: snapshot before deactivate');
    log.step(`Switching to "${options.name}"...`);
    await switchSymlink(targetDir, claude);
    await setActive(configFile, options.name);
    log.success(`Active profile: ${options.name}`);
  } finally {
    await release();
  }
}
