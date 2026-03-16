import fs from 'fs-extra';
import path from 'node:path';

export async function copyDir(src: string, dst: string): Promise<void> {
  await fs.copy(src, dst, { preserveTimestamps: true });
}

async function countFiles(dir: string): Promise<number> {
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countFiles(fullPath);
    } else {
      count++;
    }
  }
  return count;
}

export async function verifyIntegrity(src: string, dst: string): Promise<{ valid: boolean; reason?: string }> {
  const srcCount = await countFiles(src);
  const dstCount = await countFiles(dst);
  if (srcCount !== dstCount) {
    return { valid: false, reason: `File count mismatch: src=${srcCount}, dst=${dstCount}` };
  }
  return { valid: true };
}

export async function getDirSize(dir: string): Promise<number> {
  let size = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      size += await getDirSize(fullPath);
    } else {
      const stat = await fs.stat(fullPath);
      size += stat.size;
    }
  }
  return size;
}
