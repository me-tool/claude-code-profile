import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { snapshot } from '../core/git';
import { validateProfileName } from '../core/profile';
import { PROFILES_DIR } from '../core/paths';

interface SnapshotOptions {
  name: string;
  message?: string;
  profilesDir?: string;
}

export async function runSnapshot(options: SnapshotOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const dir = path.join(profiles, options.name);
  const nameCheck = validateProfileName(options.name);
  if (!nameCheck.valid) throw new Error(`Invalid profile name: ${nameCheck.reason}`);
  if (!(await fs.pathExists(dir))) throw new Error(`Profile "${options.name}" not found`);

  const msg = options.message ?? `manual snapshot ${new Date().toISOString()}`;
  const committed = await snapshot(dir, msg);
  if (committed) log.success(`Snapshot created for "${options.name}"`);
  else log.info(`No changes to snapshot for "${options.name}"`);
}
