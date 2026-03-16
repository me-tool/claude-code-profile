import path from 'node:path';
import { log } from '../utils/logger';
import { readConfig } from '../core/config';
import { PROFILES_DIR } from '../core/paths';

interface ListOptions {
  profilesDir?: string;
}

export async function runList(options: ListOptions = {}): Promise<string[]> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const config = await readConfig(configFile);

  for (const name of config.profiles) {
    const marker = name === config.active ? ' *' : '';
    log.plain(`  ${name}${marker}`);
  }

  return config.profiles;
}
