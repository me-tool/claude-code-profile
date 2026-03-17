import { log } from '../utils/logger';
import { autoCommit } from '../core/git';
import { resolveProfileDir } from '../core/profile';

interface SnapshotOptions {
  name: string;
  message?: string;
  profilesDir?: string;
}

export async function runSnapshot(options: SnapshotOptions): Promise<void> {
  const dir = await resolveProfileDir(options.name, options.profilesDir);

  const msg = options.message ?? `manual snapshot ${new Date().toISOString()}`;
  const committed = await autoCommit(dir, msg, 'snapshot');
  if (committed) log.success(`Snapshot created for "${options.name}"`);
  else log.info(`No changes to snapshot for "${options.name}"`);
}
