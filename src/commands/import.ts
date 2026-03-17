import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { readConfig } from '../core/config';
import { importItems } from '../core/importer';
import { validateProfileName } from '../core/profile';
import { autoCommit } from '../core/git';
import { migratePluginsToStore, migrateMarketplacesToStore } from '../core/store';
import { PROFILES_DIR } from '../core/paths';

interface ImportOptions {
  target: string;
  from: string;
  profilesDir?: string;
  items?: string[];
  skipPrompts?: boolean;
}

export async function runImport(options: ImportOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const targetDir = path.join(profiles, options.target);
  const sourceDir = path.join(profiles, options.from);

  const targetCheck = validateProfileName(options.target);
  if (!targetCheck.valid) throw new Error(`Invalid target profile name: ${targetCheck.reason}`);
  const fromCheck = validateProfileName(options.from);
  if (!fromCheck.valid) throw new Error(`Invalid source profile name: ${fromCheck.reason}`);
  if (!(await fs.pathExists(targetDir))) throw new Error(`Target profile "${options.target}" not found`);
  if (!(await fs.pathExists(sourceDir))) throw new Error(`Source profile "${options.from}" not found`);

  if (!options.items?.length && !options.skipPrompts) {
    const { selectImportItems } = await import('../ui/prompts.js');
    options.items = await selectImportItems();
  }
  if (!options.items?.length) throw new Error('No items selected for import');

  log.info(`Importing into "${options.target}" from "${options.from}"...`);
  log.step(`Items: ${options.items.join(', ')}`);

  await importItems(sourceDir, targetDir, options.items);

  if (options.items.includes('plugins')) {
    const config = await readConfig(path.join(profiles, '.ccp.json'));
    if (config.store) {
      await migratePluginsToStore(targetDir, config.store);
      await migrateMarketplacesToStore(targetDir, config.store);
    }
  }

  await autoCommit(targetDir, `import ${options.items.join(', ')} from "${options.from}"`);

  log.success('Import complete');
}
