import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir } from '../helpers/setup';
import { readConfig, writeConfig, addProfile, removeProfile, setActive } from '../../src/core/config';

describe('config', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    configPath = path.join(tempDir, '.ccp.json');
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should create config with defaults when none exists', async () => {
    const config = await readConfig(configPath);
    expect(config).toEqual({
      version: 1,
      active: 'default',
      profiles: [],
      createdAt: expect.any(String),
    });
  });

  it('should read existing config', async () => {
    const data = { version: 1, active: 'work', profiles: ['default', 'work'], createdAt: '2026-01-01T00:00:00Z' };
    await fs.writeJson(configPath, data);
    const config = await readConfig(configPath);
    expect(config).toEqual(data);
  });

  it('should write config', async () => {
    const data = { version: 1, active: 'default', profiles: ['default'], createdAt: '2026-01-01T00:00:00Z' };
    await writeConfig(configPath, data);
    const read = await fs.readJson(configPath);
    expect(read).toEqual(data);
  });

  it('should add profile', async () => {
    const data = { version: 1, active: 'default', profiles: ['default'], createdAt: '2026-01-01T00:00:00Z' };
    await writeConfig(configPath, data);
    await addProfile(configPath, 'work');
    const config = await readConfig(configPath);
    expect(config.profiles).toEqual(['default', 'work']);
  });

  it('should not add duplicate profile', async () => {
    const data = { version: 1, active: 'default', profiles: ['default'], createdAt: '2026-01-01T00:00:00Z' };
    await writeConfig(configPath, data);
    await addProfile(configPath, 'default');
    const config = await readConfig(configPath);
    expect(config.profiles).toEqual(['default']);
  });

  it('should remove profile', async () => {
    const data = { version: 1, active: 'default', profiles: ['default', 'work'], createdAt: '2026-01-01T00:00:00Z' };
    await writeConfig(configPath, data);
    await removeProfile(configPath, 'work');
    const config = await readConfig(configPath);
    expect(config.profiles).toEqual(['default']);
  });

  it('should set active profile', async () => {
    const data = { version: 1, active: 'default', profiles: ['default', 'work'], createdAt: '2026-01-01T00:00:00Z' };
    await writeConfig(configPath, data);
    await setActive(configPath, 'work');
    const config = await readConfig(configPath);
    expect(config.active).toBe('work');
  });
});
