import path from 'node:path';
import fs from 'fs-extra';
import { PROFILES_DIR } from './paths';

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

const BADGE_CMD = 'ccp current --badge';

/**
 * Inject ccp badge into settings.statusLine.
 * Returns the original statusLine if one was displaced (for saving to meta), null otherwise.
 */
export function injectStatusBadge(settings: Record<string, unknown>): { type: string; command: string } | null {
  const existing = settings.statusLine as { type: string; command: string } | undefined;

  if (!existing) {
    settings.statusLine = { type: 'command', command: BADGE_CMD };
    return null;
  }

  if (existing.command?.includes(BADGE_CMD)) {
    return null;
  }

  const original = { ...existing };
  settings.statusLine = { ...existing, command: `${BADGE_CMD} && ${existing.command}` };
  return original;
}

/**
 * Restore original statusLine in a real ~/.claude directory (for pause/uninstall).
 * Symmetric counterpart to injectStatusBadge.
 */
export async function restoreStatusLine(profileDir: string, claudeDir: string): Promise<void> {
  const metaPath = path.join(profileDir, '.profile.json');
  if (!(await fs.pathExists(metaPath))) return;
  const meta = await fs.readJson(metaPath);
  const settingsPath = path.join(claudeDir, 'settings.json');
  if (meta.originalStatusLine && await fs.pathExists(settingsPath)) {
    const settings = await fs.readJson(settingsPath);
    settings.statusLine = meta.originalStatusLine;
    await fs.writeJson(settingsPath, settings, { spaces: 2 });
  }
}

const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function validateProfileName(name: string): { valid: boolean; reason?: string } {
  if (!name) return { valid: false, reason: 'Profile name cannot be empty' };
  if (name.length > 64) return { valid: false, reason: 'Profile name must be 64 characters or less' };
  if (!NAME_PATTERN.test(name)) return { valid: false, reason: 'Profile name must start with alphanumeric, contain only alphanumeric, dash, or underscore' };
  return { valid: true };
}

/**
 * Validate profile name + check directory exists. Returns the absolute path.
 */
export async function resolveProfileDir(name: string, profilesDir?: string): Promise<string> {
  const profiles = profilesDir ?? PROFILES_DIR;
  const nameCheck = validateProfileName(name);
  if (!nameCheck.valid) throw new Error(`Invalid profile name: ${nameCheck.reason}`);
  const dir = path.join(profiles, name);
  if (!(await fs.pathExists(dir))) throw new Error(`Profile "${name}" not found`);
  return dir;
}
