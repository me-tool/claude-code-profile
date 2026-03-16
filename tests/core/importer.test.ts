import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir, createMockClaudeDir } from '../helpers/setup';
import { importItems } from '../../src/core/importer';

describe('importer', () => {
  let tempDir: string;
  let sourceDir: string;
  let targetDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    sourceDir = await createMockClaudeDir(tempDir);
    targetDir = path.join(tempDir, 'target');
    await fs.ensureDir(targetDir);
  });

  afterEach(async () => { await cleanupTempDir(tempDir); });

  it('should import auth files', async () => {
    await importItems(sourceDir, targetDir, ['auth']);
    expect(await fs.pathExists(path.join(targetDir, 'credentials.json'))).toBe(true);
  });

  it('should import skills directory', async () => {
    await fs.ensureDir(path.join(sourceDir, 'skills', 'test-skill'));
    await fs.writeFile(path.join(sourceDir, 'skills', 'test-skill', 'index.md'), 'skill');
    await importItems(sourceDir, targetDir, ['skills']);
    expect(await fs.pathExists(path.join(targetDir, 'skills', 'test-skill', 'index.md'))).toBe(true);
  });

  it('should merge settings fields for plugins', async () => {
    await fs.writeJson(path.join(sourceDir, 'settings.json'), {
      model: 'opus', enabledPlugins: { 'my-plugin': true }, language: 'en',
    });
    await fs.writeJson(path.join(targetDir, 'settings.json'), { language: 'zh-CN' });
    await importItems(sourceDir, targetDir, ['plugins']);
    const settings = await fs.readJson(path.join(targetDir, 'settings.json'));
    expect(settings.enabledPlugins).toEqual({ 'my-plugin': true });
    expect(settings.language).toBe('zh-CN');
    expect(settings.model).toBeUndefined();
  });
});
