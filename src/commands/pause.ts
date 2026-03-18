import path from 'node:path';
import { log } from '../utils/logger';
import { copyDir } from '../utils/fs';
import { readConfig } from '../core/config';
import { restoreStatusLine } from '../core/profile';
import { removeSymlink, isSymlink, isClaudeRunning } from '../core/symlink';
import { autoCommit } from '../core/git';
import { PROFILES_DIR, CLAUDE_DIR } from '../core/paths';
import { dereferencePlugins } from '../core/store';

interface PauseOptions {
  claudeDir?: string;
  profilesDir?: string;
  skipConfirm?: boolean;
  force?: boolean;
}

export async function runPause(options: PauseOptions = {}): Promise<void> {
  const claude = options.claudeDir ?? CLAUDE_DIR;
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');

  if (!(await isSymlink(claude))) {
    throw new Error('ccp is not active (~/.claude is not a symlink)');
  }

  if (isClaudeRunning() && !options.force) {
    log.warn('Claude Code appears to be running.');
    throw new Error('Claude is running. Use --force to override.');
  }

  if (!options.skipConfirm) {
    const { confirmAction } = await import('../ui/prompts.js');
    const confirmed = await confirmAction('Pause ccp management? ~/.claude will be restored as a real directory.');
    if (!confirmed) { log.info('Cancelled.'); return; }
  }

  const config = await readConfig(configFile);
  const activeDir = path.join(profiles, config.active);

  log.info('Pausing ccp management...');
  log.step('Snapshotting active profile...');
  await autoCommit(activeDir, 'auto: snapshot before pause');

  log.step('Restoring ~/.claude as real directory...');
  await removeSymlink(claude);
  await copyDir(activeDir, claude);
  const dangling = await dereferencePlugins(claude);
  if (dangling.length > 0) {
    log.warn(`${dangling.length} plugin(s) could not be restored (store data missing)`);
  }

  await restoreStatusLine(activeDir, claude);

  log.success('~/.claude restored as real directory');
  log.info(`Profiles preserved at ${profiles}`);
}
