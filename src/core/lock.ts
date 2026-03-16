import fs from 'fs-extra';
import { getErrorCode } from '../utils/logger';

export async function acquireLock(lockFile: string): Promise<() => Promise<void>> {
  try {
    await fs.writeFile(lockFile, String(process.pid), { flag: 'wx' });
  } catch (err: unknown) {
    if (getErrorCode(err) === 'EEXIST') {
      const content = await fs.readFile(lockFile, 'utf8').catch(() => '?');

      // Check if the locking process is still alive
      const pid = parseInt(content.trim(), 10);
      if (!isNaN(pid)) {
        try {
          process.kill(pid, 0); // Signal 0 = check existence, doesn't kill
        } catch {
          // Process is dead — stale lock. Remove and retry.
          await fs.remove(lockFile);
          try {
            await fs.writeFile(lockFile, String(process.pid), { flag: 'wx' });
            return async () => { await fs.remove(lockFile); };
          } catch {
            // Another process beat us to it
          }
        }
      }

      throw new Error(`Another ccp operation is in progress (locked by PID ${content.trim()}).`);
    }
    throw err;
  }

  return async () => {
    await fs.remove(lockFile);
  };
}

export async function releaseLock(lockFile: string): Promise<void> {
  await fs.remove(lockFile);
}
