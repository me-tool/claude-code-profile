import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { log } from '../utils/logger';
import { getHistory } from '../core/git';
import { validateProfileName } from '../core/profile';
import { PROFILES_DIR } from '../core/paths';

interface HistoryOptions {
  name: string;
  count?: number;
  profilesDir?: string;
}

export async function runHistory(options: HistoryOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const dir = path.join(profiles, options.name);
  const nameCheck = validateProfileName(options.name);
  if (!nameCheck.valid) throw new Error(`Invalid profile name: ${nameCheck.reason}`);
  if (!(await fs.pathExists(dir))) throw new Error(`Profile "${options.name}" not found`);

  const entries = await getHistory(dir, options.count ?? 20);
  log.plain(`History for "${options.name}" (${entries.length} entries):\n`);
  for (const entry of entries) {
    log.plain(`  ${chalk.yellow(entry.hash.slice(0, 8))} ${chalk.gray(entry.date)} ${entry.message}`);
  }
}
