import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { getHistory, rollbackTo } from '../core/git';
import { validateProfileName } from '../core/profile';
import { select } from '@inquirer/prompts';
import { PROFILES_DIR } from '../core/paths';

interface RollbackOptions {
  name: string;
  commit?: string;
  profilesDir?: string;
  skipPrompts?: boolean;
}

export async function runRollback(options: RollbackOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const dir = path.join(profiles, options.name);
  const nameCheck = validateProfileName(options.name);
  if (!nameCheck.valid) throw new Error(`Invalid profile name: ${nameCheck.reason}`);
  if (!(await fs.pathExists(dir))) throw new Error(`Profile "${options.name}" not found`);

  let targetHash = options.commit;
  if (!targetHash && !options.skipPrompts) {
    const entries = await getHistory(dir, 20);
    if (entries.length <= 1) throw new Error('No previous snapshots to rollback to');
    targetHash = await select({
      message: 'Select snapshot to rollback to:',
      choices: entries.slice(1).map(e => ({
        name: `${e.hash.slice(0, 8)} ${e.date} -- ${e.message}`,
        value: e.hash,
      })),
    });
  }
  if (!targetHash) throw new Error('No commit specified');

  log.step(`Rolling back "${options.name}" to ${targetHash.slice(0, 8)}...`);
  await rollbackTo(dir, targetHash);
  log.success(`Rolled back "${options.name}" to ${targetHash.slice(0, 8)}`);
}
