import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { copyDir } from '../utils/fs';
import { readConfig } from '../core/config';
import { removeSymlink, isSymlink } from '../core/symlink';
import { autoCommit } from '../core/git';
import { PROFILES_DIR, CLAUDE_DIR } from '../core/paths';

interface UninstallOptions {
  claudeDir?: string;
  profilesDir?: string;
  skipConfirm?: boolean;
}

export async function runUninstall(options: UninstallOptions = {}): Promise<void> {
  const claude = options.claudeDir ?? CLAUDE_DIR;
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');

  if (!(await isSymlink(claude))) {
    throw new Error('ccp is not active');
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

  // Restore original statusLine
  const metaPath = path.join(activeDir, '.profile.json');
  if (await fs.pathExists(metaPath)) {
    const meta = await fs.readJson(metaPath);
    const settingsPath = path.join(claude, 'settings.json');
    if (meta.originalStatusLine && await fs.pathExists(settingsPath)) {
      const settings = await fs.readJson(settingsPath);
      settings.statusLine = meta.originalStatusLine;
      await fs.writeJson(settingsPath, settings, { spaces: 2 });
    }
  }

  log.success('ccp uninstalled. ~/.claude is now a standard directory.');
  log.info(`Profiles preserved at ${profiles} for manual cleanup.`);
}
