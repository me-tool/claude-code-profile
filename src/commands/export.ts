import path from 'node:path';
import fs from 'fs-extra';
import { create as tarCreate } from 'tar';
import { log } from '../utils/logger';
import { validateProfileName } from '../core/profile';
import { PROFILES_DIR } from '../core/paths';

const DEFAULT_EXCLUDES = [
  '.git', 'credentials.json', '.credentials', 'stats-cache.json',
  'history.jsonl', 'debug', 'session-env', 'shell-snapshots',
  'todos', 'file-history', 'backups', 'plugins/cache', 'plugins/marketplaces',
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
  const sourceDir = path.join(profiles, options.name);
  const nameCheck = validateProfileName(options.name);
  if (!nameCheck.valid) throw new Error(`Invalid profile name: ${nameCheck.reason}`);
  if (!(await fs.pathExists(sourceDir))) throw new Error(`Profile "${options.name}" not found`);

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

  await tarCreate(
    {
      gzip: true,
      file: outputPath,
      cwd: profiles,
      filter: (entryPath) => {
        const prefix = options.name + '/';
        const relative = entryPath.startsWith(prefix) ? entryPath.slice(prefix.length) : entryPath;
        if (!relative) return true;
        return !excludes.some(ex => relative === ex || relative.startsWith(ex + '/'));
      },
    },
    [options.name],
  );

  log.success(`Profile exported to ${outputPath}`);
}
