import fs from 'fs-extra';
import { getErrorCode } from '../utils/logger';

export async function createSymlink(target: string, linkPath: string): Promise<void> {
  await fs.symlink(target, linkPath, 'dir');
}

export async function switchSymlink(newTarget: string, linkPath: string): Promise<void> {
  // Atomic switch: create temp symlink, then rename over (rename is atomic on POSIX)
  const tmpLink = `${linkPath}.tmp.${process.pid}`;
  await fs.symlink(newTarget, tmpLink, 'dir');
  await fs.rename(tmpLink, linkPath);
}

export async function verifySymlink(linkPath: string, expectedTarget: string): Promise<boolean> {
  try {
    const actual = await fs.readlink(linkPath);
    return actual === expectedTarget;
  } catch {
    return false;
  }
}

export async function removeSymlink(linkPath: string): Promise<void> {
  try {
    const stat = await fs.lstat(linkPath);
    if (stat.isSymbolicLink()) {
      await fs.unlink(linkPath);
    }
  } catch (err: unknown) {
    if (getErrorCode(err) !== 'ENOENT') throw err;
  }
}

export async function isSymlink(p: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(p);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}
