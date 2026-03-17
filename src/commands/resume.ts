import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { readConfig } from '../core/config';
import { createSymlink, isSymlink } from '../core/symlink';
import { injectStatusBadge } from '../core/profile';
import { autoCommit } from '../core/git';
import { PROFILES_DIR, CLAUDE_DIR } from '../core/paths';

interface ResumeOptions {
  claudeDir?: string;
  profilesDir?: string;
  skipConfirm?: boolean;
}

export async function runResume(options: ResumeOptions = {}): Promise<void> {
  const claude = options.claudeDir ?? CLAUDE_DIR;
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');

  if (await isSymlink(claude)) {
    throw new Error('ccp is already active');
  }
  if (!(await fs.pathExists(configFile))) {
    throw new Error('No ccp configuration found. Run "ccp init" first.');
  }

  const config = await readConfig(configFile);
  const activeDir = path.join(profiles, config.active);

  log.info('Resuming ccp management...');
  log.step('Syncing changes made during pause...');
  await fs.copy(claude, activeDir, { overwrite: true, preserveTimestamps: true });

  // Restore ccp badge in statusLine (pause stripped it)
  const settingsPath = path.join(activeDir, 'settings.json');
  if (await fs.pathExists(settingsPath)) {
    const settings = await fs.readJson(settingsPath);
    injectStatusBadge(settings);
    await fs.writeJson(settingsPath, settings, { spaces: 2 });
  }

  await autoCommit(activeDir, 'auto: sync changes from pause period');

  await fs.remove(claude);
  await createSymlink(activeDir, claude);
  log.success(`ccp resumed. Active profile: ${config.active}`);
}
