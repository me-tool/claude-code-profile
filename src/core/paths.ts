import path from 'node:path';
import os from 'node:os';

const home = os.homedir();

export const CCP_HOME = process.env.CCP_HOME || path.join(home, '.claude-profiles');
export const CCP_STORE = process.env.CCP_STORE || path.join(CCP_HOME, '.store');
export const PROFILES_DIR = CCP_HOME;
export const CLAUDE_DIR = path.join(home, '.claude');
export const CCP_CONFIG_FILE = path.join(PROFILES_DIR, '.ccp.json');
export const CCP_LOCK_FILE = path.join(PROFILES_DIR, '.ccp.lock');

export function profileDir(name: string): string {
  return path.join(PROFILES_DIR, name);
}

export function profileConfigFile(name: string): string {
  return path.join(PROFILES_DIR, name, '.profile.json');
}

export const CLAUDE_MD_EXCLUDES = [
  path.join(CLAUDE_DIR, 'CLAUDE.md'),
  path.join(CLAUDE_DIR, 'rules', '**'),
];

export const GITIGNORE_TEMPLATE = `# Sensitive
settings.local.json
credentials.json
.credentials
stats-cache.json
mcp-needs-auth-cache.json

# Large / transient
history.jsonl
debug/
session-env/
shell-snapshots/
todos/
file-history/
backups/
*.local.json
.DS_Store

# Plugin cache (can be reinstalled)
plugins/cache/
plugins/marketplaces/
`;
