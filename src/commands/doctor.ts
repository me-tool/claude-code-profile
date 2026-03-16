import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { log } from '../utils/logger';
import { readConfig } from '../core/config';
import { isSymlink, verifySymlink } from '../core/symlink';
import { validateProfileDir } from '../core/profile';
import { PROFILES_DIR, CLAUDE_DIR } from '../core/paths';
import simpleGit from 'simple-git';

interface DoctorOptions {
  claudeDir?: string;
  profilesDir?: string;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<void> {
  const claude = options.claudeDir ?? CLAUDE_DIR;
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  let warnings = 0;
  let errors = 0;

  const pass = (msg: string) => log.plain(`  ${chalk.green('✓')} ${msg}`);
  const warn = (msg: string) => { warnings++; log.plain(`  ${chalk.yellow('!')} ${msg}`); };
  const fail = (msg: string) => { errors++; log.plain(`  ${chalk.red('✗')} ${msg}`); };

  log.plain('Checking ccp health...\n');

  if (await isSymlink(claude)) {
    const config = await readConfig(configFile);
    const expectedTarget = path.join(profiles, config.active);
    if (await verifySymlink(claude, expectedTarget)) pass(`~/.claude is symlink -> ${expectedTarget}`);
    else fail(`~/.claude symlink target mismatch`);
  } else {
    fail('~/.claude is not a symlink');
    // Attempt auto-repair if config exists
    if (await fs.pathExists(configFile)) {
      const config = await readConfig(configFile);
      const expectedTarget = path.join(profiles, config.active);
      if (await fs.pathExists(expectedTarget)) {
        log.step('Attempting auto-repair...');
        try {
          if (await isSymlink(claude)) await fs.unlink(claude);
          // Only auto-repair if claude is a symlink or doesn't exist
          // If it's a real directory, don't auto-repair (user may have run pause)
          if (!(await fs.pathExists(claude))) {
            await fs.symlink(expectedTarget, claude, 'dir');
            pass('Symlink repaired');
          } else {
            warn('~/.claude is a real directory. Run "ccp resume" to re-enable.');
          }
        } catch (e: any) {
          fail(`Auto-repair failed: ${e.message}`);
        }
      }
    }
  }

  if (await fs.pathExists(configFile)) {
    const config = await readConfig(configFile);
    pass(`.ccp.json valid, ${config.profiles.length} profiles registered`);
    let allDirsExist = true;
    for (const name of config.profiles) {
      const dir = path.join(profiles, name);
      if (await fs.pathExists(dir)) {
        const validation = await validateProfileDir(dir);
        if (validation.valid) {
          const git = simpleGit(dir);
          const status = await git.status();
          if (!status.isClean()) warn(`Profile "${name}" has uncommitted changes`);
        } else {
          fail(`Profile "${name}": ${validation.reason}`);
        }
      } else {
        allDirsExist = false;
        fail(`Profile "${name}" directory missing`);
      }
    }
    if (allDirsExist) pass('All profile directories exist');
  } else {
    fail('.ccp.json not found');
  }

  log.plain(`\n${warnings} warning(s), ${errors} error(s)`);
}
