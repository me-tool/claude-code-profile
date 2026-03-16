import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';

export async function createTempDir(prefix = 'ccp-test-'): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return dir;
}

export async function cleanupTempDir(dir: string): Promise<void> {
  await fs.remove(dir);
}

export async function createMockClaudeDir(baseDir: string): Promise<string> {
  const claudeDir = path.join(baseDir, '.claude');
  await fs.ensureDir(claudeDir);
  await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), '# Test Profile\n');
  await fs.writeJson(path.join(claudeDir, 'settings.json'), {
    model: 'claude-sonnet-4-6',
    permissions: { allow: [], deny: [] },
    language: 'en',
  });
  await fs.writeJson(path.join(claudeDir, 'settings.local.json'), {
    env: { TEST_KEY: 'test-value' },
  });
  await fs.writeFile(path.join(claudeDir, 'credentials.json'), '{"token":"fake"}');
  await fs.ensureDir(path.join(claudeDir, 'skills'));
  await fs.ensureDir(path.join(claudeDir, 'hooks'));
  await fs.ensureDir(path.join(claudeDir, 'plugins'));
  await fs.ensureDir(path.join(claudeDir, 'rules'));
  await fs.ensureDir(path.join(claudeDir, 'projects'));
  await fs.writeFile(path.join(claudeDir, 'history.jsonl'), '');
  return claudeDir;
}
