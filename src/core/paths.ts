import path from 'node:path';
import os from 'node:os';

const home = os.homedir();

export const PROFILES_DIR = path.join(home, '.claude-profiles');
export const CLAUDE_DIR = path.join(home, '.claude');
export const CCP_CONFIG_FILE = path.join(PROFILES_DIR, '.ccp.json');
export const CCP_LOCK_FILE = path.join(PROFILES_DIR, '.ccp.lock');

export function profileDir(name: string): string {
  return path.join(PROFILES_DIR, name);
}

export function profileConfigFile(name: string): string {
  return path.join(PROFILES_DIR, name, '.profile.json');
}

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
