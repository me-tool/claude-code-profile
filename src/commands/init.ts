import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { copyDir, verifyIntegrity } from '../utils/fs';
import { writeConfig } from '../core/config';
import { createProfileMeta, writeProfileMeta } from '../core/profile';
import { createSymlink, isSymlink } from '../core/symlink';
import { initGit } from '../core/git';
import { PROFILES_DIR, CLAUDE_DIR } from '../core/paths';

interface InitOptions {
  claudeDir?: string;
  profilesDir?: string;
  skipConfirm?: boolean;
}

export async function runInit(options: InitOptions = {}): Promise<void> {
  const claude = options.claudeDir ?? CLAUDE_DIR;
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');

  if (await isSymlink(claude)) {
    throw new Error('ccp is already initialized (~/.claude is a symlink)');
  }
  if (!(await fs.pathExists(claude))) {
    throw new Error('~/.claude directory not found. Install Claude Code first.');
  }

  if (!options.skipConfirm) {
    const { confirmAction } = await import('../ui/prompts.js');
    const confirmed = await confirmAction('Initialize ccp? This will migrate ~/.claude to profile management.');
    if (!confirmed) { log.info('Cancelled.'); return; }
  }

  log.info('Migrating to ccp management...');
  await fs.ensureDir(profiles);

  const defaultProfile = path.join(profiles, 'default');
  log.step('Copying ~/.claude to profiles/default...');
  await copyDir(claude, defaultProfile);

  log.step('Verifying copy integrity...');
  const integrity = await verifyIntegrity(claude, defaultProfile);
  if (!integrity.valid) {
    await fs.remove(defaultProfile);
    throw new Error(`Copy verification failed: ${integrity.reason}`);
  }

  const meta = createProfileMeta('default', { description: 'Default profile (migrated from ~/.claude)' });
  await writeProfileMeta(path.join(defaultProfile, '.profile.json'), meta);

  // Status bar integration
  const settingsPath = path.join(defaultProfile, 'settings.json');
  if (await fs.pathExists(settingsPath)) {
    const settings = await fs.readJson(settingsPath);
    if (settings.statusLine) {
      // Save original
      const metaPath = path.join(defaultProfile, '.profile.json');
      const existingMeta = await fs.readJson(metaPath);
      existingMeta.originalStatusLine = settings.statusLine;
      await fs.writeJson(metaPath, existingMeta, { spaces: 2 });

      // Compose: prepend badge
      const originalCmd = settings.statusLine.command;
      settings.statusLine.command = `ccp current --badge && ${originalCmd}`;
      await fs.writeJson(settingsPath, settings, { spaces: 2 });
    } else {
      // No existing statusLine, add one
      settings.statusLine = { type: 'command', command: 'ccp current --badge' };
      await fs.writeJson(settingsPath, settings, { spaces: 2 });
    }
  }

  log.step('Initializing version control...');
  await initGit(defaultProfile, 'init default profile');

  // Backup - store inside .claude-profiles for cohesion
  const ts = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const backup = path.join(profiles, `.backup-${ts}`);
  log.step(`Backing up original to ${backup}...`);
  await fs.copy(claude, backup);

  try {
    log.step('Creating symlink...');
    await fs.remove(claude);
    await createSymlink(defaultProfile, claude);

    await writeConfig(configFile, {
      version: 1,
      active: 'default',
      profiles: ['default'],
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    // Rollback: if claude dir was removed, restore from backup or defaultProfile
    if (!(await fs.pathExists(claude)) && await fs.pathExists(defaultProfile)) {
      await fs.copy(defaultProfile, claude);
    }
    // Clean up partial profile
    await fs.remove(defaultProfile).catch(() => {});
    throw err;
  }

  log.success('ccp initialized. Active profile: default');
  log.info(`Original ~/.claude backed up to ${backup}`);
}
