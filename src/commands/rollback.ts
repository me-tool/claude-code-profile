import { log } from '../utils/logger';
import { getHistory, rollbackTo } from '../core/git';
import { resolveProfileDir } from '../core/profile';
import { select } from '@inquirer/prompts';

interface RollbackOptions {
  name: string;
  commit?: string;
  profilesDir?: string;
  skipPrompts?: boolean;
}

export async function runRollback(options: RollbackOptions): Promise<void> {
  const dir = await resolveProfileDir(options.name, options.profilesDir);

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
