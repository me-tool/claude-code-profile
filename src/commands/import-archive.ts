import path from 'node:path';
import fs from 'fs-extra';
import { extract as tarExtract } from 'tar';
import { log } from '../utils/logger';
import { addProfile } from '../core/config';
import { readProfileMeta, validateProfileName } from '../core/profile';
import { initGit } from '../core/git';
import { PROFILES_DIR } from '../core/paths';

interface ImportArchiveOptions {
  archivePath: string;
  name?: string;
  profilesDir?: string;
}

export async function runImportArchive(options: ImportArchiveOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  if (!(await fs.pathExists(options.archivePath))) throw new Error(`Archive not found: ${options.archivePath}`);

  const tempExtract = path.join(profiles, '.ccp-import-temp');
  await fs.ensureDir(tempExtract);

  try {
    await tarExtract({ file: options.archivePath, cwd: tempExtract });
    const entries = await fs.readdir(tempExtract);
    if (entries.length !== 1) throw new Error('Invalid archive format');

    const extractedName = entries[0];
    const targetName = options.name ?? extractedName;
    const nameCheck = validateProfileName(targetName);
    if (!nameCheck.valid) throw new Error(`Invalid name: ${nameCheck.reason}`);

    const targetDir = path.join(profiles, targetName);
    if (await fs.pathExists(targetDir)) throw new Error(`Profile "${targetName}" already exists`);

    await fs.rename(path.join(tempExtract, extractedName), targetDir);

    if (targetName !== extractedName) {
      const meta = await readProfileMeta(path.join(targetDir, '.profile.json'));
      meta.name = targetName;
      await fs.writeJson(path.join(targetDir, '.profile.json'), meta, { spaces: 2 });
    }

    await initGit(targetDir, 'imported from archive');
    await addProfile(configFile, targetName);
    log.success(`Profile "${targetName}" imported from archive`);
  } finally {
    await fs.remove(tempExtract);
  }
}
