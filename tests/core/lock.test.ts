import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir } from '../helpers/setup';
import { acquireLock, releaseLock } from '../../src/core/lock';

describe('lock', () => {
  let tempDir: string;
  let lockFile: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    lockFile = path.join(tempDir, '.ccp.lock');
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should acquire lock', async () => {
    const release = await acquireLock(lockFile);
    expect(await fs.pathExists(lockFile)).toBe(true);
    await release();
  });

  it('should release lock', async () => {
    const release = await acquireLock(lockFile);
    await release();
    expect(await fs.pathExists(lockFile)).toBe(false);
  });

  it('should fail if lock already held', async () => {
    const release = await acquireLock(lockFile);
    await expect(acquireLock(lockFile)).rejects.toThrow(/in progress/i);
    await release();
  });
});
