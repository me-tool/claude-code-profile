import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir } from '../helpers/setup';
import { createSymlink, switchSymlink, verifySymlink, removeSymlink, isSymlink } from '../../src/core/symlink';

describe('symlink', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should create symlink', async () => {
    const target = path.join(tempDir, 'profiles', 'default');
    const link = path.join(tempDir, '.claude');
    await fs.ensureDir(target);
    await createSymlink(target, link);
    expect(await isSymlink(link)).toBe(true);
    const resolved = await fs.readlink(link);
    expect(resolved).toBe(target);
  });

  it('should switch symlink target', async () => {
    const target1 = path.join(tempDir, 'profiles', 'default');
    const target2 = path.join(tempDir, 'profiles', 'work');
    const link = path.join(tempDir, '.claude');
    await fs.ensureDir(target1);
    await fs.ensureDir(target2);
    await createSymlink(target1, link);
    await switchSymlink(target2, link);
    const resolved = await fs.readlink(link);
    expect(resolved).toBe(target2);
  });

  it('should verify symlink points to expected target', async () => {
    const target = path.join(tempDir, 'profiles', 'default');
    const link = path.join(tempDir, '.claude');
    await fs.ensureDir(target);
    await createSymlink(target, link);
    expect(await verifySymlink(link, target)).toBe(true);
    expect(await verifySymlink(link, '/nonexistent')).toBe(false);
  });

  it('should remove symlink', async () => {
    const target = path.join(tempDir, 'profiles', 'default');
    const link = path.join(tempDir, '.claude');
    await fs.ensureDir(target);
    await createSymlink(target, link);
    await removeSymlink(link);
    expect(await fs.pathExists(link)).toBe(false);
  });

  it('should detect non-symlink as false', async () => {
    const dir = path.join(tempDir, 'realdir');
    await fs.ensureDir(dir);
    expect(await isSymlink(dir)).toBe(false);
  });
});
