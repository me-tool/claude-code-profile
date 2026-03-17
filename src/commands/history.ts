import chalk from 'chalk';
import { log } from '../utils/logger';
import { getHistory } from '../core/git';
import { resolveProfileDir } from '../core/profile';

interface HistoryOptions {
  name: string;
  count?: number;
  profilesDir?: string;
}

export async function runHistory(options: HistoryOptions): Promise<void> {
  const dir = await resolveProfileDir(options.name, options.profilesDir);

  const entries = await getHistory(dir, options.count ?? 20);
  log.plain(`History for "${options.name}" (${entries.length} entries):\n`);
  for (const entry of entries) {
    log.plain(`  ${chalk.yellow(entry.hash.slice(0, 8))} ${chalk.gray(entry.date)} ${entry.message}`);
  }
}
