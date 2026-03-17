import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { create as tarCreate } from 'tar';
import { log } from '../utils/logger';
import { resolveProfileDir } from '../core/profile';
import { dereferencePlugins } from '../core/store';
import { PROFILES_DIR } from '../core/paths';

const DEFAULT_EXCLUDES = [
  '.git', 'credentials.json', '.credentials', 'stats-cache.json',
  'history.jsonl', 'debug', 'session-env', 'shell-snapshots',
  'todos', 'file-history', 'backups',
  'mcp-needs-auth-cache.json', 'settings.local.json', '.DS_Store',
];

interface ExportOptions {
  name: string;
  output: string;
  profilesDir?: string;
  includeAuth?: boolean;
  includeHistory?: boolean;
}

export async function runExport(options: ExportOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const sourceDir = await resolveProfileDir(options.name, profiles);

  const excludes = [...DEFAULT_EXCLUDES];
  if (options.includeAuth) {
    ['credentials.json', '.credentials', 'stats-cache.json'].forEach(f => {
      const idx = excludes.indexOf(f);
      if (idx !== -1) excludes.splice(idx, 1);
    });
  }
  if (options.includeHistory) {
    const idx = excludes.indexOf('history.jsonl');
    if (idx !== -1) excludes.splice(idx, 1);
  }

  const outputPath = options.output.endsWith('.tar.gz')
    ? options.output : `${options.output}/${options.name}.ccp.tar.gz`;

  await fs.ensureDir(path.dirname(outputPath));
  log.step(`Exporting "${options.name}" to ${outputPath}...`);

  // Copy to temp dir and dereference plugin symlinks for self-contained archive
  const tmpExportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ccp-export-'));
  const tmpProfileDir = path.join(tmpExportDir, options.name);
  try {
    await fs.copy(sourceDir, tmpProfileDir, { preserveTimestamps: true });
    await dereferencePlugins(tmpProfileDir);

    await tarCreate(
      {
        gzip: true,
        file: outputPath,
        cwd: tmpExportDir,
        filter: (entryPath) => {
          const prefix = options.name + '/';
          const relative = entryPath.startsWith(prefix) ? entryPath.slice(prefix.length) : entryPath;
          if (!relative) return true;
          return !excludes.some(ex => relative === ex || relative.startsWith(ex + '/'));
        },
      },
      [options.name],
    );
  } finally {
    await fs.remove(tmpExportDir);
  }

  log.success(`Profile exported to ${outputPath}`);
}
