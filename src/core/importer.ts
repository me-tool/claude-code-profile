import path from 'node:path';
import fs from 'fs-extra';

const IMPORT_MAP: Record<string, { files: string[]; settingsFields: string[]; globPattern?: string }> = {
  auth: { files: ['credentials.json', '.credentials', 'stats-cache.json'], settingsFields: [] },
  plugins: { files: ['plugins/'], settingsFields: ['enabledPlugins'] },
  skills: { files: ['skills/'], settingsFields: [] },
  hooks: { files: ['hooks/'], settingsFields: ['hooks'] },
  mcp: { files: [], settingsFields: ['mcpServers'] },
  rules: { files: ['rules/', 'constitution.md'], settingsFields: [] },
  settings: { files: ['settings.json', 'settings.local.json'], settingsFields: [] },
  memory: { files: [], settingsFields: [], globPattern: 'projects/*/memory/' },
  conversations: { files: ['history.jsonl', 'session-env/'], settingsFields: [], globPattern: 'projects/*/conversations/' },
};

export async function importItems(sourceDir: string, targetDir: string, items: string[]): Promise<void> {
  const settingsFieldsToMerge: string[] = [];

  for (const item of items) {
    const mapping = IMPORT_MAP[item];
    if (!mapping) continue;

    for (const fileOrDir of mapping.files) {
      const src = path.join(sourceDir, fileOrDir);
      const dst = path.join(targetDir, fileOrDir);
      if (await fs.pathExists(src)) {
        await fs.copy(src, dst, { preserveTimestamps: true });
      }
    }

    if (mapping.globPattern) {
      const globBase = mapping.globPattern.split('*')[0];
      const globSuffix = mapping.globPattern.split('*/')[1];
      const baseDir = path.join(sourceDir, globBase);
      if (await fs.pathExists(baseDir)) {
        const entries = await fs.readdir(baseDir);
        for (const entry of entries) {
          const srcSub = path.join(baseDir, entry, globSuffix);
          if (await fs.pathExists(srcSub)) {
            const dstSub = path.join(targetDir, globBase, entry, globSuffix);
            await fs.copy(srcSub, dstSub, { preserveTimestamps: true });
          }
        }
      }
    }

    settingsFieldsToMerge.push(...mapping.settingsFields);
  }

  if (settingsFieldsToMerge.length > 0) {
    await mergeSettingsFields(sourceDir, targetDir, settingsFieldsToMerge);
  }
}

async function mergeSettingsFields(sourceDir: string, targetDir: string, fields: string[]): Promise<void> {
  const srcPath = path.join(sourceDir, 'settings.json');
  const dstPath = path.join(targetDir, 'settings.json');
  if (!(await fs.pathExists(srcPath))) return;

  const srcSettings = await fs.readJson(srcPath);
  let dstSettings: Record<string, unknown> = {};
  if (await fs.pathExists(dstPath)) dstSettings = await fs.readJson(dstPath);

  for (const field of fields) {
    if (srcSettings[field] !== undefined) dstSettings[field] = srcSettings[field];
  }
  await fs.writeJson(dstPath, dstSettings, { spaces: 2 });
}

export function getImportableItems(): string[] {
  return Object.keys(IMPORT_MAP);
}
