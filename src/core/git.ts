import simpleGit from 'simple-git';
import { GITIGNORE_TEMPLATE } from './paths';
import fs from 'fs-extra';
import path from 'node:path';

export async function initGit(dir: string, message: string): Promise<void> {
  await fs.writeFile(path.join(dir, '.gitignore'), GITIGNORE_TEMPLATE);
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig('user.name', 'ccp');
  await git.addConfig('user.email', 'ccp@local');
  await git.add('.');
  await git.commit(`ccp: ${message}`);
}

export async function autoCommit(dir: string, message: string, prefix = 'ccp'): Promise<boolean> {
  const git = simpleGit(dir);
  const status = await git.status();
  if (status.isClean()) return false;
  await git.add('.');
  await git.commit(`${prefix}: ${message}`);
  return true;
}

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
}

export async function getHistory(dir: string, maxCount: number): Promise<GitLogEntry[]> {
  const git = simpleGit(dir);
  const log = await git.log({ maxCount });
  return log.all.map(entry => ({
    hash: entry.hash,
    date: entry.date,
    message: entry.message,
  }));
}

export async function rollbackTo(dir: string, commitHash: string): Promise<void> {
  const git = simpleGit(dir);
  await git.checkout([commitHash, '--', '.']);
  await git.add('.');
  await git.commit(`ccp: rollback to ${commitHash.slice(0, 8)}`);
}
