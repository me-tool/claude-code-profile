import fs from 'fs-extra';

export interface CcpConfig {
  version: number;
  active: string;
  profiles: string[];
  createdAt: string;
  store?: string;
}

export async function readConfig(configPath: string): Promise<CcpConfig> {
  if (await fs.pathExists(configPath)) {
    return fs.readJson(configPath);
  }
  return {
    version: 1,
    active: 'default',
    profiles: [],
    createdAt: new Date().toISOString(),
  };
}

export async function writeConfig(configPath: string, config: CcpConfig): Promise<void> {
  await fs.writeJson(configPath, config, { spaces: 2 });
}

export async function addProfile(configPath: string, name: string): Promise<void> {
  const config = await readConfig(configPath);
  if (!config.profiles.includes(name)) {
    config.profiles.push(name);
    await writeConfig(configPath, config);
  }
}

export async function removeProfile(configPath: string, name: string): Promise<void> {
  const config = await readConfig(configPath);
  config.profiles = config.profiles.filter(p => p !== name);
  await writeConfig(configPath, config);
}

export async function setActive(configPath: string, name: string): Promise<void> {
  const config = await readConfig(configPath);
  config.active = name;
  await writeConfig(configPath, config);
}
