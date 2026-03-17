import path from 'node:path';
import { log } from '../utils/logger';
import { copyDir } from '../utils/fs';
import { readConfig } from '../core/config';
import { restoreStatusLine } from '../core/profile';
import { removeSymlink, isSymlink, isClaudeRunning } from '../core/symlink';
import { autoCommit } from '../core/git';
import { PROFILES_DIR, CLAUDE_DIR } from '../core/paths';

interface UninstallOptions {
  claudeDir?: string;
  profilesDir?: string;
  skipConfirm?: boolean;
  force?: boolean;
}

export async function runUninstall(options: UninstallOptions = {}): Promise<void> {
  const claude = options.claudeDir ?? CLAUDE_DIR;
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');

  if (!(await isSymlink(claude))) {
    throw new Error('ccp is not active');
  }

  if (isClaudeRunning() && !options.force) {
    log.warn('Claude Code appears to be running.');
    throw new Error('Claude is running. Use --force to override.');
  }

  if (!options.skipConfirm) {
    const { confirmAction } = await import('../ui/prompts.js');
    const confirmed = await confirmAction('Uninstall ccp? ~/.claude will be restored from the active profile.');
    if (!confirmed) { log.info('Cancelled.'); return; }
  }

  const config = await readConfig(configFile);
  const activeDir = path.join(profiles, config.active);

  log.info('Uninstalling ccp...');
  await autoCommit(activeDir, 'auto: snapshot before uninstall');

  log.step('Restoring ~/.claude...');
  await removeSymlink(claude);
  await copyDir(activeDir, claude);

  await restoreStatusLine(activeDir, claude);

  log.success('ccp uninstalled. ~/.claude is now a standard directory.');
  log.info(`Profiles preserved at ${profiles} for manual cleanup.`);
}
