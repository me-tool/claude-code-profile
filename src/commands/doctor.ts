import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { log } from '../utils/logger';
import { readConfig } from '../core/config';
import { isSymlink, verifySymlink } from '../core/symlink';
import { validateProfileDir } from '../core/profile';
import { PROFILES_DIR, CLAUDE_DIR, CCP_STORE } from '../core/paths';
import { findOrphanedStoreEntries } from '../core/store';
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

    // Plugin store checks
    log.plain('\nPlugin Store:');
    const storeDir = config.store || CCP_STORE;

    if (await fs.pathExists(storeDir)) {
      pass(`Store directory exists: ${storeDir}`);

      for (const name of config.profiles) {
        const cacheDir = path.join(profiles, name, 'plugins', 'cache');
        if (!await fs.pathExists(cacheDir)) continue;
        const mpEntries = await fs.readdir(cacheDir);
        for (const marketplace of mpEntries) {
          const mpDir = path.join(cacheDir, marketplace);
          const mpStat = await fs.lstat(mpDir);
          if (!mpStat.isDirectory() || mpStat.isSymbolicLink()) continue;
          const pluginEntries = await fs.readdir(mpDir);
          for (const plugin of pluginEntries) {
            const pluginPath = path.join(mpDir, plugin);
            const pStat = await fs.lstat(pluginPath);
            if (pStat.isSymbolicLink()) {
              const target = await fs.readlink(pluginPath);
              if (!await fs.pathExists(target)) {
                fail(`Profile "${name}": dangling symlink ${plugin} -> ${target}`);
              }
            } else if (pStat.isDirectory()) {
              warn(`Profile "${name}": plugin "${plugin}" not in store (run activate/snapshot to migrate)`);
            }
          }
        }
      }

      const profileDirs = config.profiles.map(n => path.join(profiles, n));
      const orphans = await findOrphanedStoreEntries(storeDir, profileDirs);
      if (orphans.length > 0) {
        warn(`${orphans.length} orphaned plugin(s) in store (run "ccp gc" to clean)`);
      }
    } else {
      warn(`Store directory not found: ${storeDir}`);
    }

    if (!process.env.CCP_HOME) {
      warn('CCP_HOME environment variable not set. Run "source ~/.zshrc" or restart shell.');
    }
  } else {
    fail('.ccp.json not found');
  }

  log.plain(`\n${warnings} warning(s), ${errors} error(s)`);
}
