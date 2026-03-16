import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir } from '../helpers/setup';
import { copyDir, verifyIntegrity, getDirSize } from '../../src/utils/fs';

describe('fs utils', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should copy directory', async () => {
    const src = path.join(tempDir, 'src');
    const dst = path.join(tempDir, 'dst');
    await fs.ensureDir(src);
    await fs.writeFile(path.join(src, 'a.txt'), 'hello');
    await fs.ensureDir(path.join(src, 'sub'));
    await fs.writeFile(path.join(src, 'sub', 'b.txt'), 'world');
    await copyDir(src, dst);
    expect(await fs.readFile(path.join(dst, 'a.txt'), 'utf8')).toBe('hello');
    expect(await fs.readFile(path.join(dst, 'sub', 'b.txt'), 'utf8')).toBe('world');
  });

  it('should verify integrity (file count match)', async () => {
    const src = path.join(tempDir, 'src');
    const dst = path.join(tempDir, 'dst');
    await fs.ensureDir(src);
    await fs.writeFile(path.join(src, 'a.txt'), 'hello');
    await fs.copy(src, dst);
    const result = await verifyIntegrity(src, dst);
    expect(result.valid).toBe(true);
  });

  it('should get directory size', async () => {
    const dir = path.join(tempDir, 'dir');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'a.txt'), 'hello');
    const size = await getDirSize(dir);
    expect(size).toBeGreaterThan(0);
  });
});
