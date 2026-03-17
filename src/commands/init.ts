import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { copyDir, verifyIntegrity } from '../utils/fs';
import { writeConfig } from '../core/config';
import { createProfileMeta, writeProfileMeta, injectStatusBadge } from '../core/profile';
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
    const original = injectStatusBadge(settings);
    if (original) {
      const metaPath = path.join(defaultProfile, '.profile.json');
      const existingMeta = await fs.readJson(metaPath);
      existingMeta.originalStatusLine = original;
      await fs.writeJson(metaPath, existingMeta, { spaces: 2 });
    }
    await fs.writeJson(settingsPath, settings, { spaces: 2 });
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

  // Shell completion setup
  const rcFile = await setupShellCompletion();

  log.success('ccp initialized. Active profile: default');
  log.info(`Original ~/.claude backed up to ${backup}`);
  if (rcFile) {
    log.info(`Shell completion added to ${rcFile}`);
    log.info(`Run: source ${rcFile}`);
  }
}

const COMPLETION_MARKER = '# ccp shell completion';

async function setupShellCompletion(): Promise<string | null> {
  const shell = process.env.SHELL || '';
  const home = os.homedir();

  let rcFile: string;
  let shellType: string;

  if (shell.endsWith('/zsh')) {
    shellType = 'zsh';
    rcFile = path.join(home, '.zshrc');
  } else if (shell.endsWith('/bash')) {
    shellType = 'bash';
    // macOS: .bash_profile is loaded for login shells, .bashrc for non-login
    const bashrc = path.join(home, '.bashrc');
    const bashProfile = path.join(home, '.bash_profile');
    rcFile = (await fs.pathExists(bashrc)) ? bashrc : bashProfile;
  } else if (shell.endsWith('/fish')) {
    shellType = 'fish';
    rcFile = path.join(home, '.config', 'fish', 'config.fish');
  } else {
    return null;
  }

  if (!(await fs.pathExists(rcFile))) {
    return null;
  }

  const content = await fs.readFile(rcFile, 'utf-8');
  if (content.includes(COMPLETION_MARKER)) {
    return null; // already installed
  }

  const snippet = `\n${COMPLETION_MARKER}\neval "$(ccp completion ${shellType})"\n`;
  await fs.appendFile(rcFile, snippet);
  return rcFile;
}
