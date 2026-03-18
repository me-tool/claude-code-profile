import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { copyDir } from '../utils/fs';
import { readConfig } from '../core/config';
import { restoreStatusLine } from '../core/profile';
import { removeSymlink, isSymlink, isClaudeRunning } from '../core/symlink';
import { autoCommit } from '../core/git';
import { PROFILES_DIR, CLAUDE_DIR } from '../core/paths';
import { dereferencePlugins } from '../core/store';

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
  const dangling = await dereferencePlugins(claude);
  if (dangling.length > 0) {
    log.warn(`${dangling.length} plugin(s) could not be restored (store data missing)`);
  }

  await restoreStatusLine(activeDir, claude);

  log.success('ccp uninstalled. ~/.claude is now a standard directory.');
  log.info(`Profiles preserved at ${profiles} for manual cleanup.`);

  // Clean CCP env vars from shell rc
  await cleanShellEnvVars();
}

async function cleanShellEnvVars(): Promise<void> {
  const shell = process.env.SHELL || '';
  const home = os.homedir();
  let rcFile: string | null = null;

  if (shell.endsWith('/zsh')) rcFile = path.join(home, '.zshrc');
  else if (shell.endsWith('/bash')) {
    const bashrc = path.join(home, '.bashrc');
    rcFile = (await fs.pathExists(bashrc)) ? bashrc : path.join(home, '.bash_profile');
  } else if (shell.endsWith('/fish')) {
    rcFile = path.join(home, '.config', 'fish', 'config.fish');
  }

  if (!rcFile || !await fs.pathExists(rcFile)) return;

  try {
    const original = await fs.readFile(rcFile, 'utf-8');
    let content = original;
    // Match marker-based blocks (new format with end marker)
    content = content.replace(/\n# ccp shell completion\n[\s\S]*?# end ccp\n/g, '');
    // Match legacy format (without end marker)
    content = content.replace(/\n# ccp shell completion\neval "[^"]*"\nexport CCP_HOME="[^"]*"\nexport CCP_STORE="[^"]*"\n/g, '');
    if (content !== original) {
      await fs.writeFile(rcFile, content);
      log.info(`Cleaned CCP env vars from ${rcFile}`);
    }
  } catch (err: any) {
    log.warn(`Could not clean shell env vars: ${err.message}. Manually remove CCP_HOME/CCP_STORE exports from your shell rc file.`);
  }
}
