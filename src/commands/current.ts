import path from 'node:path';
import { readConfig } from '../core/config';
import { PROFILES_DIR } from '../core/paths';

interface CurrentOptions {
  profilesDir?: string;
  badge?: boolean;
}

export async function runCurrent(options: CurrentOptions = {}): Promise<string> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const config = await readConfig(path.join(profiles, '.ccp.json'));
  if (options.badge) process.stdout.write(`[${config.active}]`);
  return config.active;
}
