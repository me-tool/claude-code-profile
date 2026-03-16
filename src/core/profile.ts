import fs from 'fs-extra';

export interface ProfileMeta {
  name: string;
  description?: string;
  createdAt: string;
  importedFrom?: string;
  importedItems?: string[];
  originalStatusLine?: { type: string; command: string } | null;
}

interface CreateOptions {
  description?: string;
  importedFrom?: string;
  importedItems?: string[];
}

export function createProfileMeta(name: string, options: CreateOptions = {}): ProfileMeta {
  return {
    name,
    description: options.description,
    createdAt: new Date().toISOString(),
    importedFrom: options.importedFrom,
    importedItems: options.importedItems,
  };
}

export async function readProfileMeta(metaPath: string): Promise<ProfileMeta> {
  return fs.readJson(metaPath);
}

export async function writeProfileMeta(metaPath: string, meta: ProfileMeta): Promise<void> {
  await fs.writeJson(metaPath, meta, { spaces: 2 });
}

export async function validateProfileDir(dir: string): Promise<{ valid: boolean; reason?: string }> {
  const metaPath = `${dir}/.profile.json`;
  if (!(await fs.pathExists(metaPath))) {
    return { valid: false, reason: 'Missing .profile.json' };
  }
  try {
    const meta = await fs.readJson(metaPath);
    if (!meta.name) return { valid: false, reason: '.profile.json missing name field' };
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid .profile.json' };
  }
}

const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function validateProfileName(name: string): { valid: boolean; reason?: string } {
  if (!name) return { valid: false, reason: 'Profile name cannot be empty' };
  if (name.length > 64) return { valid: false, reason: 'Profile name must be 64 characters or less' };
  if (!NAME_PATTERN.test(name)) return { valid: false, reason: 'Profile name must start with alphanumeric, contain only alphanumeric, dash, or underscore' };
  return { valid: true };
}
