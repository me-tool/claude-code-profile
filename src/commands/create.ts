import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { copyDir } from '../utils/fs';
import { readConfig, addProfile } from '../core/config';
import { createProfileMeta, writeProfileMeta, validateProfileName, injectStatusBadge } from '../core/profile';
import { initGit } from '../core/git';
import { importItems } from '../core/importer';
import { migratePluginsToStore, migrateMarketplacesToStore } from '../core/store';
import { PROFILES_DIR, CLAUDE_MD_EXCLUDES } from '../core/paths';

interface CreateOptions {
  name: string;
  profilesDir?: string;
  from?: string;
  description?: string;
  skipPrompts?: boolean;
  importItems?: string[];
}

export async function runCreate(options: CreateOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const targetDir = path.join(profiles, options.name);

  const nameCheck = validateProfileName(options.name);
  if (!nameCheck.valid) throw new Error(`Invalid profile name: ${nameCheck.reason}`);
  if (await fs.pathExists(targetDir)) throw new Error(`Profile "${options.name}" already exists`);

  log.info(`Creating profile "${options.name}"...`);

  // If no --from and no skipPrompts, ask interactively
  if (!options.from && !options.skipPrompts) {
    const config = await readConfig(configFile);
    const sourceChoices = [...config.profiles, 'Skip (empty profile)'];
    const { select } = await import('@inquirer/prompts');
    const chosen = await select({
      message: 'Import from existing profile?',
      choices: sourceChoices.map(p => ({ name: p, value: p })),
    });
    if (chosen !== 'Skip (empty profile)') {
      options.from = chosen;
      const { selectImportItems } = await import('../ui/prompts.js');
      options.importItems = await selectImportItems();
    } else {
      options.importItems = [];
    }
  }

  if (options.from && !options.importItems) {
    // Full clone
    const sourceDir = path.join(profiles, options.from);
    if (!(await fs.pathExists(sourceDir))) throw new Error(`Source profile "${options.from}" not found`);
    log.step(`Cloning from "${options.from}"...`);
    await copyDir(sourceDir, targetDir);
    await fs.remove(path.join(targetDir, '.git'));

    // Re-migrate plugins to store (copyDir may have dereferenced symlinks)
    const config = await readConfig(path.join(profiles, '.ccp.json'));
    if (config.store) {
      await migratePluginsToStore(targetDir, config.store);
      await migrateMarketplacesToStore(targetDir, config.store);
    }

    // Ensure cloned profile has isolation settings
    const settingsPath = path.join(targetDir, 'settings.json');
    const clonedSettings = await fs.pathExists(settingsPath)
      ? await fs.readJson(settingsPath)
      : {};
    clonedSettings.claudeMdExcludes = CLAUDE_MD_EXCLUDES;
    injectStatusBadge(clonedSettings);
    await fs.writeJson(settingsPath, clonedSettings, { spaces: 2 });
  } else {
    // Empty profile or selective import
    await fs.ensureDir(targetDir);
    await fs.writeFile(path.join(targetDir, 'CLAUDE.md'), '');
    const profileSettings: Record<string, unknown> = {
      claudeMdExcludes: CLAUDE_MD_EXCLUDES,
      statusLine: { type: 'command', command: 'ccp current --badge' },
    };
    await fs.writeJson(path.join(targetDir, 'settings.json'), profileSettings, { spaces: 2 });

    if (options.from && options.importItems && options.importItems.length > 0) {
      const sourceDir = path.join(profiles, options.from);
      if (!(await fs.pathExists(sourceDir))) throw new Error(`Source profile "${options.from}" not found`);
      log.step(`Importing ${options.importItems.join(', ')} from "${options.from}"...`);
      await importItems(sourceDir, targetDir, options.importItems);
    }
  }

  const meta = createProfileMeta(options.name, {
    description: options.description,
    importedFrom: options.from,
    importedItems: options.importItems,
  });
  await writeProfileMeta(path.join(targetDir, '.profile.json'), meta);

  log.step('Initializing version control...');
  await initGit(targetDir, `init profile "${options.name}"`);
  await addProfile(configFile, options.name);

  log.success(`Profile "${options.name}" created`);
}
