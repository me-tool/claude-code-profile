# CCP (Claude Code Profile) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node CLI tool (`ccp`) that manages isolated Claude Code profiles with symlink switching, selective import, git version control, and parallel launch support.

**Architecture:** Each profile is a complete `~/.claude` equivalent stored under `~/.claude-profiles/<name>/`. The primary isolation mechanism is symlink switching (`~/.claude` → active profile), with `CLAUDE_CONFIG_DIR` as a secondary mechanism for parallel instances. Each profile has its own git repo for automatic version control.

**Tech Stack:** TypeScript, commander, @inquirer/prompts, fs-extra, simple-git, tar, chalk, vitest (testing), tsup (build)

**Spec:** `docs/superpowers/specs/2026-03-16-ccp-design.md`

---

## File Structure

```
cc-profile/
  package.json                     # Project manifest, bin: { ccp: "./dist/bin/ccp.js" }
  tsconfig.json                    # TypeScript config (ESM, strict)
  vitest.config.ts                 # Test configuration
  README.md                        # User documentation
  LICENSE                          # MIT
  bin/
    ccp.ts                         # CLI entry point — commander program setup, registers all commands
  src/
    core/
      paths.ts                     # Path constants (PROFILES_DIR, CLAUDE_DIR, BACKUP_DIR, etc.)
      config.ts                    # .ccp.json CRUD (read, write, addProfile, removeProfile, setActive)
      profile.ts                   # .profile.json CRUD + profile directory validation
      symlink.ts                   # Symlink create/switch/verify/remove
      git.ts                       # Git operations (init, autoCommit, snapshot, history, rollback)
      importer.ts                  # Import logic (per-category file copy + settings field merge)
      lock.ts                      # File-based lock for concurrent operations
    commands/
      init.ts                      # ccp init
      pause.ts                     # ccp pause
      resume.ts                    # ccp resume
      uninstall.ts                 # ccp uninstall
      create.ts                    # ccp create
      delete.ts                    # ccp delete
      list.ts                      # ccp list
      info.ts                      # ccp info
      rename.ts                    # ccp rename
      copy.ts                      # ccp copy
      activate.ts                  # ccp activate
      deactivate.ts                # ccp deactivate
      launch.ts                    # ccp launch
      current.ts                   # ccp current
      import.ts                    # ccp import
      export.ts                    # ccp export
      import-archive.ts            # ccp import-archive
      snapshot.ts                  # ccp snapshot
      history.ts                   # ccp history
      rollback.ts                  # ccp rollback
      doctor.ts                    # ccp doctor
    ui/
      prompts.ts                   # Inquirer prompts (selectProfile, selectImportItems, confirm)
    utils/
      fs.ts                        # File ops (copyDir, verifyIntegrity, getDirSize)
      logger.ts                    # Colored output helpers (info, success, warn, error, step)
  tests/
    core/
      config.test.ts
      profile.test.ts
      symlink.test.ts
      git.test.ts
      importer.test.ts
      lock.test.ts
    commands/
      init.test.ts
      create.test.ts
      activate.test.ts
      lifecycle.test.ts
    utils/
      fs.test.ts
    helpers/
      setup.ts                    # Test helpers (temp dir creation, mock profile factories)
```

---

## Chunk 1: Foundation

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `bin/ccp.ts`
- Create: `LICENSE`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "claude-code-profile",
  "version": "0.1.0",
  "description": "Chrome-like profile management for Claude Code",
  "type": "module",
  "bin": {
    "ccp": "./dist/bin/ccp.js"
  },
  "scripts": {
    "dev": "tsx bin/ccp.ts",
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": ["claude", "claude-code", "profile", "cli"],
  "license": "MIT",
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "@inquirer/prompts": "^7.0.0",
    "chalk": "^5.3.0",
    "commander": "^13.0.0",
    "fs-extra": "^11.2.0",
    "simple-git": "^3.27.0",
    "tar": "^7.4.0"
  },
  "devDependencies": {
    "@types/fs-extra": "^11.0.4",
    "@types/node": "^22.0.0",
    "tsup": "^8.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  },
  "tsup": {
    "entry": ["bin/ccp.ts"],
    "format": ["esm"],
    "dts": false,
    "clean": true,
    "target": "node18",
    "splitting": false,
    "bundle": true,
    "external": ["simple-git"]
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": false
  },
  "include": ["bin/**/*.ts", "src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10000,
  },
});
```

- [ ] **Step 4: Create bin/ccp.ts (minimal shell)**

```typescript
#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('ccp')
  .description('Claude Code Profile — Chrome-like profile management for Claude Code')
  .version('0.1.0');

program.parse();
```

- [ ] **Step 5: Create LICENSE (MIT)**

Standard MIT license file with current year.

- [ ] **Step 6: Install dependencies**

Run: `pnpm install`

- [ ] **Step 7: Verify build works**

Run: `pnpm build && node dist/bin/ccp.js --version`
Expected: `0.1.0`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: project scaffold with CLI entry point"
```

---

### Task 2: Test Helpers + Logger

**Files:**
- Create: `tests/helpers/setup.ts`
- Create: `src/utils/logger.ts`
- Create: `tests/utils/logger.test.ts` (skip — logger is output-only, test via integration)

- [ ] **Step 1: Create test helpers**

```typescript
// tests/helpers/setup.ts
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';

export async function createTempDir(prefix = 'ccp-test-'): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return dir;
}

export async function cleanupTempDir(dir: string): Promise<void> {
  await fs.remove(dir);
}

/**
 * Create a mock ~/.claude directory structure for testing.
 */
export async function createMockClaudeDir(baseDir: string): Promise<string> {
  const claudeDir = path.join(baseDir, '.claude');
  await fs.ensureDir(claudeDir);
  await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), '# Test Profile\n');
  await fs.writeJson(path.join(claudeDir, 'settings.json'), {
    model: 'claude-sonnet-4-6',
    permissions: { allow: [], deny: [] },
    language: 'en',
  });
  await fs.writeJson(path.join(claudeDir, 'settings.local.json'), {
    env: { TEST_KEY: 'test-value' },
  });
  await fs.writeFile(path.join(claudeDir, 'credentials.json'), '{"token":"fake"}');
  await fs.ensureDir(path.join(claudeDir, 'skills'));
  await fs.ensureDir(path.join(claudeDir, 'hooks'));
  await fs.ensureDir(path.join(claudeDir, 'plugins'));
  await fs.ensureDir(path.join(claudeDir, 'rules'));
  await fs.ensureDir(path.join(claudeDir, 'projects'));
  await fs.writeFile(path.join(claudeDir, 'history.jsonl'), '');
  return claudeDir;
}
```

- [ ] **Step 2: Create logger**

```typescript
// src/utils/logger.ts
import chalk from 'chalk';

export const log = {
  info: (msg: string) => console.log(chalk.blue('i'), msg),
  success: (msg: string) => console.log(chalk.green('✓'), msg),
  warn: (msg: string) => console.log(chalk.yellow('!'), msg),
  error: (msg: string) => console.error(chalk.red('✗'), msg),
  step: (msg: string) => console.log(chalk.gray('  →'), msg),
  plain: (msg: string) => console.log(msg),
};
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add test helpers and logger utility"
```

---

### Task 3: Paths Module

**Files:**
- Create: `src/core/paths.ts`

- [ ] **Step 1: Implement paths**

```typescript
// src/core/paths.ts
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

export function backupDir(): string {
  const ts = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15); // YYYYMMDDTHHMMSS
  return path.join(home, `.claude-backup-${ts}`);
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
```

- [ ] **Step 2: Commit**

```bash
git add src/core/paths.ts
git commit -m "feat: add paths module with constants and helpers"
```

---

### Task 4: Config Module (.ccp.json)

**Files:**
- Create: `src/core/config.ts`
- Create: `tests/core/config.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir } from '../helpers/setup.js';
import { readConfig, writeConfig, addProfile, removeProfile, setActive } from '../../src/core/config.js';

describe('config', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    configPath = path.join(tempDir, '.ccp.json');
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should create config with defaults when none exists', async () => {
    const config = await readConfig(configPath);
    expect(config).toEqual({
      version: 1,
      active: 'default',
      profiles: [],
      createdAt: expect.any(String),
    });
  });

  it('should read existing config', async () => {
    const data = { version: 1, active: 'work', profiles: ['default', 'work'], createdAt: '2026-01-01T00:00:00Z' };
    await fs.writeJson(configPath, data);
    const config = await readConfig(configPath);
    expect(config).toEqual(data);
  });

  it('should write config', async () => {
    const data = { version: 1, active: 'default', profiles: ['default'], createdAt: '2026-01-01T00:00:00Z' };
    await writeConfig(configPath, data);
    const read = await fs.readJson(configPath);
    expect(read).toEqual(data);
  });

  it('should add profile', async () => {
    const data = { version: 1, active: 'default', profiles: ['default'], createdAt: '2026-01-01T00:00:00Z' };
    await writeConfig(configPath, data);
    await addProfile(configPath, 'work');
    const config = await readConfig(configPath);
    expect(config.profiles).toEqual(['default', 'work']);
  });

  it('should not add duplicate profile', async () => {
    const data = { version: 1, active: 'default', profiles: ['default'], createdAt: '2026-01-01T00:00:00Z' };
    await writeConfig(configPath, data);
    await addProfile(configPath, 'default');
    const config = await readConfig(configPath);
    expect(config.profiles).toEqual(['default']);
  });

  it('should remove profile', async () => {
    const data = { version: 1, active: 'default', profiles: ['default', 'work'], createdAt: '2026-01-01T00:00:00Z' };
    await writeConfig(configPath, data);
    await removeProfile(configPath, 'work');
    const config = await readConfig(configPath);
    expect(config.profiles).toEqual(['default']);
  });

  it('should set active profile', async () => {
    const data = { version: 1, active: 'default', profiles: ['default', 'work'], createdAt: '2026-01-01T00:00:00Z' };
    await writeConfig(configPath, data);
    await setActive(configPath, 'work');
    const config = await readConfig(configPath);
    expect(config.active).toBe('work');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/core/config.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement config module**

```typescript
// src/core/config.ts
import fs from 'fs-extra';

export interface CcpConfig {
  version: number;
  active: string;
  profiles: string[];
  createdAt: string;
}

export async function readConfig(configPath: string): Promise<CcpConfig> {
  if (await fs.pathExists(configPath)) {
    return fs.readJson(configPath);
  }
  return {
    version: 1,
    active: 'default',
    profiles: [],
    createdAt: new Date().toISOString(),
  };
}

export async function writeConfig(configPath: string, config: CcpConfig): Promise<void> {
  await fs.writeJson(configPath, config, { spaces: 2 });
}

export async function addProfile(configPath: string, name: string): Promise<void> {
  const config = await readConfig(configPath);
  if (!config.profiles.includes(name)) {
    config.profiles.push(name);
    await writeConfig(configPath, config);
  }
}

export async function removeProfile(configPath: string, name: string): Promise<void> {
  const config = await readConfig(configPath);
  config.profiles = config.profiles.filter(p => p !== name);
  await writeConfig(configPath, config);
}

export async function setActive(configPath: string, name: string): Promise<void> {
  const config = await readConfig(configPath);
  config.active = name;
  await writeConfig(configPath, config);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/core/config.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/config.ts tests/core/config.test.ts
git commit -m "feat: add config module for .ccp.json management"
```

---

### Task 5: Profile Module (.profile.json)

**Files:**
- Create: `src/core/profile.ts`
- Create: `tests/core/profile.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/profile.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir } from '../helpers/setup.js';
import {
  createProfileMeta,
  readProfileMeta,
  writeProfileMeta,
  validateProfileDir,
  validateProfileName,
} from '../../src/core/profile.js';

describe('profile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should create profile metadata', () => {
    const meta = createProfileMeta('reviewer', { description: 'Review only', importedFrom: 'default', importedItems: ['auth'] });
    expect(meta.name).toBe('reviewer');
    expect(meta.description).toBe('Review only');
    expect(meta.importedFrom).toBe('default');
    expect(meta.importedItems).toEqual(['auth']);
    expect(meta.createdAt).toBeDefined();
  });

  it('should write and read profile metadata', async () => {
    const profilePath = path.join(tempDir, '.profile.json');
    const meta = createProfileMeta('test');
    await writeProfileMeta(profilePath, meta);
    const read = await readProfileMeta(profilePath);
    expect(read.name).toBe('test');
  });

  it('should validate profile directory', async () => {
    const profileDir = path.join(tempDir, 'myprofile');
    await fs.ensureDir(profileDir);
    await writeProfileMeta(path.join(profileDir, '.profile.json'), createProfileMeta('myprofile'));
    const result = await validateProfileDir(profileDir);
    expect(result.valid).toBe(true);
  });

  it('should reject invalid profile directory (no .profile.json)', async () => {
    const profileDir = path.join(tempDir, 'bad');
    await fs.ensureDir(profileDir);
    const result = await validateProfileDir(profileDir);
    expect(result.valid).toBe(false);
  });

  it('should validate profile names', () => {
    expect(validateProfileName('default')).toEqual({ valid: true });
    expect(validateProfileName('my-work')).toEqual({ valid: true });
    expect(validateProfileName('work_2')).toEqual({ valid: true });
    expect(validateProfileName('')).toEqual({ valid: false, reason: expect.any(String) });
    expect(validateProfileName('.hidden')).toEqual({ valid: false, reason: expect.any(String) });
    expect(validateProfileName('has space')).toEqual({ valid: false, reason: expect.any(String) });
    expect(validateProfileName('a/b')).toEqual({ valid: false, reason: expect.any(String) });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/core/profile.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement profile module**

```typescript
// src/core/profile.ts
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
  if (!NAME_PATTERN.test(name)) return { valid: false, reason: 'Profile name must start with alphanumeric, contain only alphanumeric, dash, or underscore' };
  return { valid: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/core/profile.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/profile.ts tests/core/profile.test.ts
git commit -m "feat: add profile module for .profile.json management"
```

---

### Task 6: File System Utilities

**Files:**
- Create: `src/utils/fs.ts`
- Create: `tests/utils/fs.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/utils/fs.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir } from '../helpers/setup.js';
import { copyDir, verifyIntegrity, getDirSize } from '../../src/utils/fs.js';

describe('fs utils', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should copy directory', async () => {
    const src = path.join(tempDir, 'src');
    const dst = path.join(tempDir, 'dst');
    await fs.ensureDir(src);
    await fs.writeFile(path.join(src, 'a.txt'), 'hello');
    await fs.ensureDir(path.join(src, 'sub'));
    await fs.writeFile(path.join(src, 'sub', 'b.txt'), 'world');
    await copyDir(src, dst);
    expect(await fs.readFile(path.join(dst, 'a.txt'), 'utf8')).toBe('hello');
    expect(await fs.readFile(path.join(dst, 'sub', 'b.txt'), 'utf8')).toBe('world');
  });

  it('should verify integrity (file count match)', async () => {
    const src = path.join(tempDir, 'src');
    const dst = path.join(tempDir, 'dst');
    await fs.ensureDir(src);
    await fs.writeFile(path.join(src, 'a.txt'), 'hello');
    await fs.copy(src, dst);
    const result = await verifyIntegrity(src, dst);
    expect(result.valid).toBe(true);
  });

  it('should get directory size', async () => {
    const dir = path.join(tempDir, 'dir');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'a.txt'), 'hello');
    const size = await getDirSize(dir);
    expect(size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/utils/fs.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement fs utils**

```typescript
// src/utils/fs.ts
import fs from 'fs-extra';
import path from 'node:path';

export async function copyDir(src: string, dst: string): Promise<void> {
  await fs.copy(src, dst, { preserveTimestamps: true });
}

async function countFiles(dir: string): Promise<number> {
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countFiles(fullPath);
    } else {
      count++;
    }
  }
  return count;
}

export async function verifyIntegrity(src: string, dst: string): Promise<{ valid: boolean; reason?: string }> {
  const srcCount = await countFiles(src);
  const dstCount = await countFiles(dst);
  if (srcCount !== dstCount) {
    return { valid: false, reason: `File count mismatch: src=${srcCount}, dst=${dstCount}` };
  }
  return { valid: true };
}

export async function getDirSize(dir: string): Promise<number> {
  let size = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      size += await getDirSize(fullPath);
    } else {
      const stat = await fs.stat(fullPath);
      size += stat.size;
    }
  }
  return size;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/utils/fs.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/fs.ts tests/utils/fs.test.ts
git commit -m "feat: add file system utility functions"
```

---

## Chunk 2: Symlink + Git + Lock

### Task 7: Symlink Module

**Files:**
- Create: `src/core/symlink.ts`
- Create: `tests/core/symlink.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/symlink.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir } from '../helpers/setup.js';
import { createSymlink, switchSymlink, verifySymlink, removeSymlink, isSymlink } from '../../src/core/symlink.js';

describe('symlink', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should create symlink', async () => {
    const target = path.join(tempDir, 'profiles', 'default');
    const link = path.join(tempDir, '.claude');
    await fs.ensureDir(target);
    await createSymlink(target, link);
    expect(await isSymlink(link)).toBe(true);
    const resolved = await fs.readlink(link);
    expect(resolved).toBe(target);
  });

  it('should switch symlink target', async () => {
    const target1 = path.join(tempDir, 'profiles', 'default');
    const target2 = path.join(tempDir, 'profiles', 'work');
    const link = path.join(tempDir, '.claude');
    await fs.ensureDir(target1);
    await fs.ensureDir(target2);
    await createSymlink(target1, link);
    await switchSymlink(target2, link);
    const resolved = await fs.readlink(link);
    expect(resolved).toBe(target2);
  });

  it('should verify symlink points to expected target', async () => {
    const target = path.join(tempDir, 'profiles', 'default');
    const link = path.join(tempDir, '.claude');
    await fs.ensureDir(target);
    await createSymlink(target, link);
    expect(await verifySymlink(link, target)).toBe(true);
    expect(await verifySymlink(link, '/nonexistent')).toBe(false);
  });

  it('should remove symlink', async () => {
    const target = path.join(tempDir, 'profiles', 'default');
    const link = path.join(tempDir, '.claude');
    await fs.ensureDir(target);
    await createSymlink(target, link);
    await removeSymlink(link);
    expect(await fs.pathExists(link)).toBe(false);
  });

  it('should detect non-symlink as false', async () => {
    const dir = path.join(tempDir, 'realdir');
    await fs.ensureDir(dir);
    expect(await isSymlink(dir)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/core/symlink.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement symlink module**

```typescript
// src/core/symlink.ts
import fs from 'fs-extra';

export async function createSymlink(target: string, linkPath: string): Promise<void> {
  await fs.symlink(target, linkPath, 'dir');
}

export async function switchSymlink(newTarget: string, linkPath: string): Promise<void> {
  // Atomic switch: create temp symlink, then rename over (rename is atomic on POSIX)
  const tmpLink = `${linkPath}.tmp.${process.pid}`;
  await fs.symlink(newTarget, tmpLink, 'dir');
  await fs.rename(tmpLink, linkPath);
}

export async function verifySymlink(linkPath: string, expectedTarget: string): Promise<boolean> {
  try {
    const actual = await fs.readlink(linkPath);
    return actual === expectedTarget;
  } catch {
    return false;
  }
}

export async function removeSymlink(linkPath: string): Promise<void> {
  try {
    const stat = await fs.lstat(linkPath);
    if (stat.isSymbolicLink()) {
      await fs.unlink(linkPath);
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}

export async function isSymlink(p: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(p);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/core/symlink.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/symlink.ts tests/core/symlink.test.ts
git commit -m "feat: add symlink management module"
```

---

### Task 8: Git Module

**Files:**
- Create: `src/core/git.ts`
- Create: `tests/core/git.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/git.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir } from '../helpers/setup.js';
import { initGit, autoCommit, snapshot, getHistory, rollbackTo } from '../../src/core/git.js';

describe('git', () => {
  let tempDir: string;
  let profileDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    profileDir = path.join(tempDir, 'profile');
    await fs.ensureDir(profileDir);
    await fs.writeFile(path.join(profileDir, 'CLAUDE.md'), '# Initial\n');
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should init git repo with initial commit', async () => {
    await initGit(profileDir, 'init default profile');
    expect(await fs.pathExists(path.join(profileDir, '.git'))).toBe(true);
  });

  it('should auto-commit changes', async () => {
    await initGit(profileDir, 'init');
    await fs.writeFile(path.join(profileDir, 'CLAUDE.md'), '# Changed\n');
    const committed = await autoCommit(profileDir, 'auto: test change');
    expect(committed).toBe(true);
  });

  it('should not commit when nothing changed', async () => {
    await initGit(profileDir, 'init');
    const committed = await autoCommit(profileDir, 'auto: no change');
    expect(committed).toBe(false);
  });

  it('should create snapshot with message', async () => {
    await initGit(profileDir, 'init');
    await fs.writeFile(path.join(profileDir, 'CLAUDE.md'), '# Snapshot\n');
    await snapshot(profileDir, 'manual snapshot');
    const history = await getHistory(profileDir, 5);
    expect(history[0].message).toContain('manual snapshot');
  });

  it('should get history', async () => {
    await initGit(profileDir, 'init');
    const history = await getHistory(profileDir, 10);
    expect(history.length).toBe(1);
    expect(history[0].message).toContain('init');
  });

  it('should rollback to previous commit', async () => {
    await initGit(profileDir, 'init');
    await fs.writeFile(path.join(profileDir, 'CLAUDE.md'), '# V2\n');
    await snapshot(profileDir, 'version 2');
    const history = await getHistory(profileDir, 10);
    const initCommit = history[history.length - 1].hash;
    await rollbackTo(profileDir, initCommit);
    const content = await fs.readFile(path.join(profileDir, 'CLAUDE.md'), 'utf8');
    expect(content).toBe('# Initial\n');
    // Should have created a new commit (not destructive)
    const newHistory = await getHistory(profileDir, 10);
    expect(newHistory.length).toBe(3); // init + v2 + rollback
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/core/git.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement git module**

```typescript
// src/core/git.ts
import simpleGit from 'simple-git';
import { GITIGNORE_TEMPLATE } from './paths.js';
import fs from 'fs-extra';
import path from 'node:path';

export async function initGit(dir: string, message: string): Promise<void> {
  // Write .gitignore before init
  await fs.writeFile(path.join(dir, '.gitignore'), GITIGNORE_TEMPLATE);

  const git = simpleGit(dir);
  await git.init();
  await git.add('.');
  await git.commit(`ccp: ${message}`);
}

export async function autoCommit(dir: string, message: string): Promise<boolean> {
  const git = simpleGit(dir);
  const status = await git.status();
  if (status.isClean()) return false;
  await git.add('.');
  await git.commit(`ccp: ${message}`);
  return true;
}

export async function snapshot(dir: string, message: string): Promise<boolean> {
  const git = simpleGit(dir);
  const status = await git.status();
  if (status.isClean()) return false;
  await git.add('.');
  await git.commit(`snapshot: ${message}`);
  return true;
}

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
}

export async function getHistory(dir: string, maxCount: number): Promise<GitLogEntry[]> {
  const git = simpleGit(dir);
  const log = await git.log({ maxCount });
  return log.all.map(entry => ({
    hash: entry.hash,
    date: entry.date,
    message: entry.message,
  }));
}

export async function rollbackTo(dir: string, commitHash: string): Promise<void> {
  const git = simpleGit(dir);
  await git.checkout([commitHash, '--', '.']);
  await git.add('.');
  await git.commit(`ccp: rollback to ${commitHash}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/core/git.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/git.ts tests/core/git.test.ts
git commit -m "feat: add git module for profile version control"
```

---

### Task 9: Lock Module

**Files:**
- Create: `src/core/lock.ts`
- Create: `tests/core/lock.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/lock.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir } from '../helpers/setup.js';
import { acquireLock, releaseLock } from '../../src/core/lock.js';

describe('lock', () => {
  let tempDir: string;
  let lockFile: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    lockFile = path.join(tempDir, '.ccp.lock');
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should acquire lock', async () => {
    const release = await acquireLock(lockFile);
    expect(await fs.pathExists(lockFile)).toBe(true);
    await release();
  });

  it('should release lock', async () => {
    const release = await acquireLock(lockFile);
    await release();
    expect(await fs.pathExists(lockFile)).toBe(false);
  });

  it('should fail if lock already held', async () => {
    const release = await acquireLock(lockFile);
    await expect(acquireLock(lockFile)).rejects.toThrow(/locked/i);
    await release();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/core/lock.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement lock module**

```typescript
// src/core/lock.ts
import fs from 'fs-extra';

export async function acquireLock(lockFile: string): Promise<() => Promise<void>> {
  try {
    // Atomic exclusive create — avoids TOCTOU race condition
    await fs.writeFile(lockFile, String(process.pid), { flag: 'wx' });
  } catch (err: any) {
    if (err.code === 'EEXIST') {
      const content = await fs.readFile(lockFile, 'utf8').catch(() => '?');
      throw new Error(`Another ccp operation is in progress (locked by PID ${content.trim()}). If this is stale, remove ${lockFile}`);
    }
    throw err;
  }

  return async () => {
    await fs.remove(lockFile);
  };
}

export async function releaseLock(lockFile: string): Promise<void> {
  await fs.remove(lockFile);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/core/lock.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/lock.ts tests/core/lock.test.ts
git commit -m "feat: add file-based lock for concurrent operation safety"
```

---

## Chunk 3: Init + Lifecycle Commands

### Task 10: UI Prompts Module

**Files:**
- Create: `src/ui/prompts.ts`

- [ ] **Step 1: Implement prompts**

```typescript
// src/ui/prompts.ts
import { select, checkbox, confirm, input } from '@inquirer/prompts';

export const IMPORT_ITEMS = [
  { name: 'auth — API keys, tokens, credentials', value: 'auth' },
  { name: 'plugins — Installed plugins + config', value: 'plugins' },
  { name: 'skills — Skill definitions', value: 'skills' },
  { name: 'hooks — Hook scripts + config', value: 'hooks' },
  { name: 'mcp — MCP server configs', value: 'mcp' },
  { name: 'rules — Rule files', value: 'rules' },
  { name: 'settings — settings.json (model, permissions, env...)', value: 'settings' },
  { name: 'memory — Project memory files', value: 'memory' },
  { name: 'conversations — History + sessions', value: 'conversations' },
] as const;

export async function selectProfile(profiles: string[], message = 'Select profile:'): Promise<string> {
  return select({
    message,
    choices: profiles.map(p => ({ name: p, value: p })),
  });
}

export async function selectImportItems(): Promise<string[]> {
  return checkbox({
    message: 'Select items to import:',
    choices: IMPORT_ITEMS.map(item => ({
      ...item,
      checked: ['plugins', 'skills'].includes(item.value), // safe defaults, auth not pre-selected
    })),
  });
}

export async function confirmAction(message: string): Promise<boolean> {
  return confirm({ message, default: false });
}

export async function inputText(message: string, defaultValue?: string): Promise<string> {
  return input({ message, default: defaultValue });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/prompts.ts
git commit -m "feat: add interactive prompt utilities"
```

---

### Task 11: Init Command

**Files:**
- Create: `src/commands/init.ts`
- Create: `tests/commands/init.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/commands/init.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir, createMockClaudeDir } from '../helpers/setup.js';
import { runInit } from '../../src/commands/init.js';

describe('init command', () => {
  let tempDir: string;
  let claudeDir: string;
  let profilesDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    claudeDir = await createMockClaudeDir(tempDir);
    profilesDir = path.join(tempDir, '.claude-profiles');
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should migrate ~/.claude to profiles/default', async () => {
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
    const defaultDir = path.join(profilesDir, 'default');
    expect(await fs.pathExists(defaultDir)).toBe(true);
    expect(await fs.pathExists(path.join(defaultDir, 'CLAUDE.md'))).toBe(true);
    expect(await fs.pathExists(path.join(defaultDir, '.profile.json'))).toBe(true);
    expect(await fs.pathExists(path.join(defaultDir, '.git'))).toBe(true);
  });

  it('should create symlink from claudeDir to default profile', async () => {
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
    const stat = await fs.lstat(claudeDir);
    expect(stat.isSymbolicLink()).toBe(true);
    const target = await fs.readlink(claudeDir);
    expect(target).toBe(path.join(profilesDir, 'default'));
  });

  it('should create .ccp.json', async () => {
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
    const config = await fs.readJson(path.join(profilesDir, '.ccp.json'));
    expect(config.active).toBe('default');
    expect(config.profiles).toEqual(['default']);
  });

  it('should create backup of original claude dir', async () => {
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
    // Check backup exists (pattern: .claude-backup-YYYYMMDD in tempDir)
    const entries = await fs.readdir(tempDir);
    const backups = entries.filter(e => e.startsWith('.claude-backup-'));
    expect(backups.length).toBe(1);
  });

  it('should refuse if already initialized', async () => {
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
    await expect(runInit({ claudeDir, profilesDir, skipConfirm: true })).rejects.toThrow(/already initialized/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/commands/init.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement init command**

```typescript
// src/commands/init.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger.js';
import { copyDir, verifyIntegrity } from '../utils/fs.js';
import { writeConfig } from '../core/config.js';
import { createProfileMeta, writeProfileMeta } from '../core/profile.js';
import { createSymlink, isSymlink } from '../core/symlink.js';
import { initGit } from '../core/git.js';
import {
  PROFILES_DIR, CLAUDE_DIR, CCP_CONFIG_FILE, profileDir, profileConfigFile, backupDir,
} from '../core/paths.js';

interface InitOptions {
  claudeDir?: string;
  profilesDir?: string;
  skipConfirm?: boolean;
}

export async function runInit(options: InitOptions = {}): Promise<void> {
  const claude = options.claudeDir ?? CLAUDE_DIR;
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');

  // Guard: already initialized
  if (await isSymlink(claude)) {
    throw new Error('ccp is already initialized (~/.claude is a symlink)');
  }

  if (!(await fs.pathExists(claude))) {
    throw new Error('~/.claude directory not found. Install Claude Code first.');
  }

  log.info('Migrating to ccp management...');

  // Step 1: Create profiles dir
  await fs.ensureDir(profiles);

  // Step 2: Copy ~/.claude → profiles/default
  const defaultProfile = path.join(profiles, 'default');
  log.step('Copying ~/.claude to profiles/default...');
  await copyDir(claude, defaultProfile);

  // Step 3: Verify copy
  log.step('Verifying copy integrity...');
  const integrity = await verifyIntegrity(claude, defaultProfile);
  if (!integrity.valid) {
    await fs.remove(defaultProfile);
    throw new Error(`Copy verification failed: ${integrity.reason}`);
  }

  // Step 4: Write .profile.json
  const meta = createProfileMeta('default', { description: 'Default profile (migrated from ~/.claude)' });
  await writeProfileMeta(path.join(defaultProfile, '.profile.json'), meta);

  // Step 5: Git init
  log.step('Initializing version control...');
  await initGit(defaultProfile, 'init default profile');

  // Step 6: Backup original
  const backup = backupDir().replace(
    path.dirname(CLAUDE_DIR),
    path.dirname(claude),
  );
  log.step(`Backing up original to ${backup}...`);
  await fs.copy(claude, backup);

  // Step 7: Replace with symlink
  log.step('Creating symlink...');
  await fs.remove(claude);
  await createSymlink(defaultProfile, claude);

  // Step 8: Write .ccp.json
  await writeConfig(configFile, {
    version: 1,
    active: 'default',
    profiles: ['default'],
    createdAt: new Date().toISOString(),
  });

  log.success('ccp initialized. Active profile: default');
  log.info(`Original ~/.claude backed up to ${backup}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/commands/init.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Register init command in CLI entry point**

Update `bin/ccp.ts` to add the init command:

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from '../src/commands/init.js';

const program = new Command();

program
  .name('ccp')
  .description('Claude Code Profile — Chrome-like profile management for Claude Code')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize ccp, migrate ~/.claude to profile management')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (opts) => {
    try {
      await runInit({ skipConfirm: opts.yes });
    } catch (e: any) {
      console.error(e.message);
      process.exit(1);
    }
  });

program.parse();
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: implement init command with migration and safety checks"
```

---

### Task 12: Pause, Resume, Uninstall Commands

**Files:**
- Create: `src/commands/pause.ts`
- Create: `src/commands/resume.ts`
- Create: `src/commands/uninstall.ts`
- Create: `tests/commands/lifecycle.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/commands/lifecycle.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir, createMockClaudeDir } from '../helpers/setup.js';
import { runInit } from '../../src/commands/init.js';
import { runPause } from '../../src/commands/pause.js';
import { runResume } from '../../src/commands/resume.js';
import { runUninstall } from '../../src/commands/uninstall.js';
import { isSymlink } from '../../src/core/symlink.js';

describe('lifecycle commands', () => {
  let tempDir: string;
  let claudeDir: string;
  let profilesDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    claudeDir = await createMockClaudeDir(tempDir);
    profilesDir = path.join(tempDir, '.claude-profiles');
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('pause', () => {
    it('should restore ~/.claude as real directory', async () => {
      await runPause({ claudeDir, profilesDir, skipConfirm: true });
      expect(await isSymlink(claudeDir)).toBe(false);
      expect(await fs.pathExists(path.join(claudeDir, 'CLAUDE.md'))).toBe(true);
    });

    it('should preserve profiles directory', async () => {
      await runPause({ claudeDir, profilesDir, skipConfirm: true });
      expect(await fs.pathExists(profilesDir)).toBe(true);
    });
  });

  describe('resume', () => {
    it('should re-establish symlink after pause', async () => {
      await runPause({ claudeDir, profilesDir, skipConfirm: true });
      await runResume({ claudeDir, profilesDir, skipConfirm: true });
      expect(await isSymlink(claudeDir)).toBe(true);
    });
  });

  describe('uninstall', () => {
    it('should restore ~/.claude and keep profiles dir', async () => {
      await runUninstall({ claudeDir, profilesDir, skipConfirm: true });
      expect(await isSymlink(claudeDir)).toBe(false);
      expect(await fs.pathExists(path.join(claudeDir, 'CLAUDE.md'))).toBe(true);
      expect(await fs.pathExists(profilesDir)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/commands/lifecycle.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement pause command**

```typescript
// src/commands/pause.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger.js';
import { copyDir } from '../utils/fs.js';
import { readConfig } from '../core/config.js';
import { removeSymlink, isSymlink } from '../core/symlink.js';
import { autoCommit } from '../core/git.js';
import { PROFILES_DIR, CLAUDE_DIR } from '../core/paths.js';

interface PauseOptions {
  claudeDir?: string;
  profilesDir?: string;
  skipConfirm?: boolean;
}

export async function runPause(options: PauseOptions = {}): Promise<void> {
  const claude = options.claudeDir ?? CLAUDE_DIR;
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');

  if (!(await isSymlink(claude))) {
    throw new Error('ccp is not active (~/.claude is not a symlink)');
  }

  const config = await readConfig(configFile);
  const activeDir = path.join(profiles, config.active);

  log.info('Pausing ccp management...');

  // Auto-snapshot
  log.step('Snapshotting active profile...');
  await autoCommit(activeDir, 'auto: snapshot before pause');

  // Remove symlink and copy active profile to claude dir
  log.step('Restoring ~/.claude as real directory...');
  await removeSymlink(claude);
  await copyDir(activeDir, claude);

  log.success('~/.claude restored as real directory');
  log.info(`Profiles preserved at ${profiles}`);
  log.info("Run 'ccp resume' to re-enable");
}
```

- [ ] **Step 4: Implement resume command**

```typescript
// src/commands/resume.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger.js';
import { readConfig } from '../core/config.js';
import { createSymlink, isSymlink } from '../core/symlink.js';
import { autoCommit } from '../core/git.js';
import { PROFILES_DIR, CLAUDE_DIR } from '../core/paths.js';

interface ResumeOptions {
  claudeDir?: string;
  profilesDir?: string;
  skipConfirm?: boolean;
}

export async function runResume(options: ResumeOptions = {}): Promise<void> {
  const claude = options.claudeDir ?? CLAUDE_DIR;
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');

  if (await isSymlink(claude)) {
    throw new Error('ccp is already active');
  }

  if (!(await fs.pathExists(configFile))) {
    throw new Error('No ccp configuration found. Run "ccp init" first.');
  }

  const config = await readConfig(configFile);
  const activeDir = path.join(profiles, config.active);

  log.info('Resuming ccp management...');

  // Sync any changes made during pause back into the profile
  log.step('Syncing changes made during pause...');
  await fs.copy(claude, activeDir, { overwrite: true, preserveTimestamps: true });
  await autoCommit(activeDir, 'auto: sync changes from pause period');

  // Remove real dir, create symlink
  await fs.remove(claude);
  await createSymlink(activeDir, claude);

  log.success(`ccp resumed. Active profile: ${config.active}`);
}
```

- [ ] **Step 5: Implement uninstall command**

```typescript
// src/commands/uninstall.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger.js';
import { copyDir } from '../utils/fs.js';
import { readConfig } from '../core/config.js';
import { removeSymlink, isSymlink } from '../core/symlink.js';
import { autoCommit } from '../core/git.js';
import { PROFILES_DIR, CLAUDE_DIR } from '../core/paths.js';

interface UninstallOptions {
  claudeDir?: string;
  profilesDir?: string;
  skipConfirm?: boolean;
}

export async function runUninstall(options: UninstallOptions = {}): Promise<void> {
  const claude = options.claudeDir ?? CLAUDE_DIR;
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');

  if (!(await isSymlink(claude))) {
    throw new Error('ccp is not active (~/.claude is not a symlink)');
  }

  const config = await readConfig(configFile);
  const activeDir = path.join(profiles, config.active);

  log.info('Uninstalling ccp...');

  // Auto-snapshot
  await autoCommit(activeDir, 'auto: snapshot before uninstall');

  // Restore real directory from active profile
  log.step('Restoring ~/.claude...');
  await removeSymlink(claude);
  await copyDir(activeDir, claude);

  log.success('ccp uninstalled. ~/.claude is now a standard directory.');
  log.info(`Profiles preserved at ${profiles} for manual cleanup.`);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test -- tests/commands/lifecycle.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 7: Register commands in bin/ccp.ts**

Add pause, resume, uninstall commands to the CLI entry point following the same pattern as init.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: implement pause, resume, uninstall lifecycle commands"
```

---

## Chunk 4: Profile CRUD + Activation

### Task 13: Create Command

**Files:**
- Create: `src/commands/create.ts`
- Create: `tests/commands/create.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/commands/create.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir, createMockClaudeDir } from '../helpers/setup.js';
import { runInit } from '../../src/commands/init.js';
import { runCreate } from '../../src/commands/create.js';

describe('create command', () => {
  let tempDir: string;
  let claudeDir: string;
  let profilesDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    claudeDir = await createMockClaudeDir(tempDir);
    profilesDir = path.join(tempDir, '.claude-profiles');
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should create empty profile', async () => {
    await runCreate({
      name: 'reviewer',
      profilesDir,
      skipPrompts: true,
      importItems: [],
    });
    const profileDir = path.join(profilesDir, 'reviewer');
    expect(await fs.pathExists(profileDir)).toBe(true);
    expect(await fs.pathExists(path.join(profileDir, '.profile.json'))).toBe(true);
    expect(await fs.pathExists(path.join(profileDir, 'CLAUDE.md'))).toBe(true);
    expect(await fs.pathExists(path.join(profileDir, '.git'))).toBe(true);
  });

  it('should create profile with --from (full clone)', async () => {
    await runCreate({
      name: 'work',
      profilesDir,
      from: 'default',
      skipPrompts: true,
    });
    const profileDir = path.join(profilesDir, 'work');
    expect(await fs.pathExists(path.join(profileDir, 'settings.json'))).toBe(true);
    expect(await fs.pathExists(path.join(profileDir, 'CLAUDE.md'))).toBe(true);
  });

  it('should create profile with selective import', async () => {
    await runCreate({
      name: 'partial',
      profilesDir,
      from: 'default',
      skipPrompts: true,
      importItems: ['auth'],
    });
    const profileDir = path.join(profilesDir, 'partial');
    // Auth files should exist
    expect(await fs.pathExists(path.join(profileDir, 'credentials.json'))).toBe(true);
    // Non-imported items should not exist
    expect(await fs.pathExists(path.join(profileDir, 'settings.json'))).toBe(false);
  });

  it('should reject duplicate name', async () => {
    await expect(runCreate({
      name: 'default',
      profilesDir,
      skipPrompts: true,
      importItems: [],
    })).rejects.toThrow(/already exists/i);
  });

  it('should reject invalid name', async () => {
    await expect(runCreate({
      name: '.bad',
      profilesDir,
      skipPrompts: true,
      importItems: [],
    })).rejects.toThrow();
  });

  it('should register profile in .ccp.json', async () => {
    await runCreate({ name: 'test', profilesDir, skipPrompts: true, importItems: [] });
    const config = await fs.readJson(path.join(profilesDir, '.ccp.json'));
    expect(config.profiles).toContain('test');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/commands/create.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement importer core (needed by create)**

```typescript
// src/core/importer.ts
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

export async function importItems(
  sourceDir: string,
  targetDir: string,
  items: string[],
): Promise<void> {
  const settingsFieldsToMerge: string[] = [];

  for (const item of items) {
    const mapping = IMPORT_MAP[item];
    if (!mapping) continue;

    // Copy files/directories
    for (const fileOrDir of mapping.files) {
      const src = path.join(sourceDir, fileOrDir);
      const dst = path.join(targetDir, fileOrDir);
      if (await fs.pathExists(src)) {
        await fs.copy(src, dst, { preserveTimestamps: true });
      }
    }

    // Handle glob patterns (e.g., projects/*/memory/)
    if (mapping.globPattern) {
      const globBase = mapping.globPattern.split('*')[0]; // e.g., "projects/"
      const globSuffix = mapping.globPattern.split('*/')[1]; // e.g., "memory/"
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

  // Merge settings fields if needed
  if (settingsFieldsToMerge.length > 0) {
    await mergeSettingsFields(sourceDir, targetDir, settingsFieldsToMerge);
  }
}

async function mergeSettingsFields(
  sourceDir: string,
  targetDir: string,
  fields: string[],
): Promise<void> {
  const srcSettingsPath = path.join(sourceDir, 'settings.json');
  const dstSettingsPath = path.join(targetDir, 'settings.json');

  if (!(await fs.pathExists(srcSettingsPath))) return;

  const srcSettings = await fs.readJson(srcSettingsPath);
  let dstSettings: Record<string, any> = {};

  if (await fs.pathExists(dstSettingsPath)) {
    dstSettings = await fs.readJson(dstSettingsPath);
  }

  for (const field of fields) {
    if (srcSettings[field] !== undefined) {
      dstSettings[field] = srcSettings[field];
    }
  }

  await fs.writeJson(dstSettingsPath, dstSettings, { spaces: 2 });
}

export function getImportableItems(): string[] {
  return Object.keys(IMPORT_MAP);
}
```

- [ ] **Step 4: Implement create command**

```typescript
// src/commands/create.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger.js';
import { copyDir } from '../utils/fs.js';
import { readConfig, addProfile } from '../core/config.js';
import { createProfileMeta, writeProfileMeta, validateProfileName } from '../core/profile.js';
import { initGit } from '../core/git.js';
import { importItems } from '../core/importer.js';
import { PROFILES_DIR, GITIGNORE_TEMPLATE } from '../core/paths.js';

interface CreateOptions {
  name: string;
  profilesDir?: string;
  from?: string;
  description?: string;
  skipPrompts?: boolean;
  importItems?: string[];
}

export async function runCreate(options: CreateOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const targetDir = path.join(profiles, options.name);

  // Validate name
  const nameCheck = validateProfileName(options.name);
  if (!nameCheck.valid) {
    throw new Error(`Invalid profile name: ${nameCheck.reason}`);
  }

  // Check for duplicates
  if (await fs.pathExists(targetDir)) {
    throw new Error(`Profile "${options.name}" already exists`);
  }

  log.info(`Creating profile "${options.name}"...`);

  if (options.from && !options.importItems) {
    // Full clone mode (--from without selective import)
    const sourceDir = path.join(profiles, options.from);
    if (!(await fs.pathExists(sourceDir))) {
      throw new Error(`Source profile "${options.from}" not found`);
    }
    log.step(`Cloning from "${options.from}"...`);
    await copyDir(sourceDir, targetDir);
    // Remove .git from clone (will re-init)
    await fs.remove(path.join(targetDir, '.git'));
  } else {
    // Empty profile or selective import
    await fs.ensureDir(targetDir);
    await fs.writeFile(path.join(targetDir, 'CLAUDE.md'), '');
    await fs.writeJson(path.join(targetDir, 'settings.json'), {}, { spaces: 2 });

    if (options.from && options.importItems && options.importItems.length > 0) {
      const sourceDir = path.join(profiles, options.from);
      if (!(await fs.pathExists(sourceDir))) {
        throw new Error(`Source profile "${options.from}" not found`);
      }
      log.step(`Importing ${options.importItems.join(', ')} from "${options.from}"...`);
      await importItems(sourceDir, targetDir, options.importItems);
    }
  }

  // Write profile metadata
  const meta = createProfileMeta(options.name, {
    description: options.description,
    importedFrom: options.from,
    importedItems: options.importItems,
  });
  await writeProfileMeta(path.join(targetDir, '.profile.json'), meta);

  // Git init
  log.step('Initializing version control...');
  await initGit(targetDir, `init profile "${options.name}"`);

  // Register in .ccp.json
  await addProfile(configFile, options.name);

  log.success(`Profile "${options.name}" created`);
  log.info(`Run 'ccp activate ${options.name}' to start using it`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- tests/commands/create.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: implement create command with selective import"
```

---

### Task 14: Activate, Deactivate, Current, Launch Commands

**Files:**
- Create: `src/commands/activate.ts`
- Create: `src/commands/deactivate.ts`
- Create: `src/commands/current.ts`
- Create: `src/commands/launch.ts`
- Create: `tests/commands/activate.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/commands/activate.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir, createMockClaudeDir } from '../helpers/setup.js';
import { runInit } from '../../src/commands/init.js';
import { runCreate } from '../../src/commands/create.js';
import { runActivate } from '../../src/commands/activate.js';
import { runCurrent } from '../../src/commands/current.js';

describe('activate/deactivate/current', () => {
  let tempDir: string;
  let claudeDir: string;
  let profilesDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    claudeDir = await createMockClaudeDir(tempDir);
    profilesDir = path.join(tempDir, '.claude-profiles');
    await runInit({ claudeDir, profilesDir, skipConfirm: true });
    await runCreate({ name: 'work', profilesDir, skipPrompts: true, importItems: [] });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should switch active profile', async () => {
    await runActivate({ name: 'work', claudeDir, profilesDir, skipConfirm: true });
    const target = await fs.readlink(claudeDir);
    expect(target).toBe(path.join(profilesDir, 'work'));
  });

  it('should update .ccp.json active field', async () => {
    await runActivate({ name: 'work', claudeDir, profilesDir, skipConfirm: true });
    const config = await fs.readJson(path.join(profilesDir, '.ccp.json'));
    expect(config.active).toBe('work');
  });

  it('should return current active profile', async () => {
    const name = await runCurrent({ profilesDir });
    expect(name).toBe('default');
  });

  it('should reject activating nonexistent profile', async () => {
    await expect(
      runActivate({ name: 'nope', claudeDir, profilesDir, skipConfirm: true })
    ).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/commands/activate.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement activate**

```typescript
// src/commands/activate.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger.js';
import { execFileSync } from 'node:child_process';
import { readConfig, setActive } from '../core/config.js';
import { switchSymlink } from '../core/symlink.js';
import { autoCommit } from '../core/git.js';
import { acquireLock } from '../core/lock.js';
import { PROFILES_DIR, CLAUDE_DIR, CCP_LOCK_FILE } from '../core/paths.js';

function isClaudeRunning(): boolean {
  try {
    execFileSync('pgrep', ['-x', 'claude'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

interface ActivateOptions {
  name: string;
  claudeDir?: string;
  profilesDir?: string;
  skipConfirm?: boolean;
  force?: boolean;
}

export async function runActivate(options: ActivateOptions): Promise<void> {
  const claude = options.claudeDir ?? CLAUDE_DIR;
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const lockFile = path.join(profiles, '.ccp.lock');
  const targetDir = path.join(profiles, options.name);

  if (!(await fs.pathExists(targetDir))) {
    throw new Error(`Profile "${options.name}" not found`);
  }

  // Detect running Claude process (best-effort via pgrep)
  if (isClaudeRunning() && !options.force) {
    log.warn('Claude Code appears to be running. Switching profiles while Claude is active may cause issues.');
    throw new Error('Claude is running. Use --force to override.');
  }

  const config = await readConfig(configFile);
  if (config.active === options.name) {
    log.info(`Profile "${options.name}" is already active`);
    return;
  }

  const release = await acquireLock(lockFile);
  try {
    // Auto-snapshot current profile
    const currentDir = path.join(profiles, config.active);
    log.step(`Snapshotting "${config.active}"...`);
    await autoCommit(currentDir, 'auto: snapshot before deactivate');

    // Switch symlink
    log.step(`Switching to "${options.name}"...`);
    await switchSymlink(targetDir, claude);
    await setActive(configFile, options.name);

    log.success(`Active profile: ${options.name}`);
  } finally {
    await release();
  }
}
```

- [ ] **Step 4: Implement deactivate**

```typescript
// src/commands/deactivate.ts
import { runActivate } from './activate.js';
import { CLAUDE_DIR, PROFILES_DIR } from '../core/paths.js';

interface DeactivateOptions {
  claudeDir?: string;
  profilesDir?: string;
  skipConfirm?: boolean;
}

export async function runDeactivate(options: DeactivateOptions = {}): Promise<void> {
  await runActivate({
    name: 'default',
    claudeDir: options.claudeDir ?? CLAUDE_DIR,
    profilesDir: options.profilesDir ?? PROFILES_DIR,
    skipConfirm: options.skipConfirm,
  });
}
```

- [ ] **Step 5: Implement current**

```typescript
// src/commands/current.ts
import path from 'node:path';
import { readConfig } from '../core/config.js';
import { PROFILES_DIR } from '../core/paths.js';

interface CurrentOptions {
  profilesDir?: string;
  badge?: boolean;
}

export async function runCurrent(options: CurrentOptions = {}): Promise<string> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const config = await readConfig(configFile);

  if (options.badge) {
    process.stdout.write(`[${config.active}]`);
  }
  return config.active;
}
```

- [ ] **Step 6: Implement launch**

```typescript
// src/commands/launch.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger.js';
import { readConfig } from '../core/config.js';
import { PROFILES_DIR } from '../core/paths.js';

interface LaunchOptions {
  name: string;
  profilesDir?: string;
}

export async function runLaunch(options: LaunchOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const targetDir = path.join(profiles, options.name);

  if (!(await fs.pathExists(targetDir))) {
    throw new Error(`Profile "${options.name}" not found`);
  }

  const config = await readConfig(configFile);
  if (config.active === options.name) {
    log.warn(`Profile "${options.name}" is already active via symlink. Use 'claude' directly or launch a different profile.`);
    return;
  }

  log.info(`Launching claude with profile "${options.name}"`);
  log.step(`CLAUDE_CONFIG_DIR=${targetDir}`);

  const { spawnSync } = await import('node:child_process');
  spawnSync('claude', [], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: targetDir },
    stdio: 'inherit',
  });
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test -- tests/commands/activate.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: implement activate, deactivate, current, launch commands"
```

---

### Task 15: List, Info, Delete, Rename, Copy Commands

**Files:**
- Create: `src/commands/list.ts`
- Create: `src/commands/info.ts`
- Create: `src/commands/delete.ts`
- Create: `src/commands/rename.ts`
- Create: `src/commands/copy.ts`

These commands follow the same patterns established in Tasks 11-14. Implementation details:

- [ ] **Step 1: Implement list**

```typescript
// src/commands/list.ts
import path from 'node:path';
import { log } from '../utils/logger.js';
import { readConfig } from '../core/config.js';
import { PROFILES_DIR } from '../core/paths.js';

interface ListOptions {
  profilesDir?: string;
}

export async function runList(options: ListOptions = {}): Promise<string[]> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const config = await readConfig(path.join(profiles, '.ccp.json'));

  for (const name of config.profiles) {
    const marker = name === config.active ? ' (active)' : '';
    log.plain(`  ${name === config.active ? '*' : ' '} ${name}${marker}`);
  }
  return config.profiles;
}
```

- [ ] **Step 2: Implement info**

```typescript
// src/commands/info.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger.js';
import { readProfileMeta } from '../core/profile.js';
import { getDirSize } from '../utils/fs.js';
import { readConfig } from '../core/config.js';
import { PROFILES_DIR } from '../core/paths.js';

interface InfoOptions {
  name: string;
  profilesDir?: string;
}

export async function runInfo(options: InfoOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const dir = path.join(profiles, options.name);
  const config = await readConfig(path.join(profiles, '.ccp.json'));

  if (!(await fs.pathExists(dir))) {
    throw new Error(`Profile "${options.name}" not found`);
  }

  const meta = await readProfileMeta(path.join(dir, '.profile.json'));
  const size = await getDirSize(dir);
  const isActive = config.active === options.name;

  log.plain(`Profile: ${meta.name}${isActive ? ' (active)' : ''}`);
  if (meta.description) log.plain(`Description: ${meta.description}`);
  log.plain(`Created: ${meta.createdAt}`);
  if (meta.importedFrom) log.plain(`Imported from: ${meta.importedFrom}`);
  if (meta.importedItems?.length) log.plain(`Imported items: ${meta.importedItems.join(', ')}`);
  log.plain(`Disk usage: ${(size / 1024 / 1024).toFixed(1)} MB`);
  log.plain(`Path: ${dir}`);
}
```

- [ ] **Step 3: Implement delete**

```typescript
// src/commands/delete.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger.js';
import { readConfig, removeProfile } from '../core/config.js';
import { acquireLock } from '../core/lock.js';
import { PROFILES_DIR } from '../core/paths.js';

interface DeleteOptions {
  name: string;
  profilesDir?: string;
  skipConfirm?: boolean;
}

export async function runDelete(options: DeleteOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const lockFile = path.join(profiles, '.ccp.lock');
  const config = await readConfig(configFile);

  if (config.active === options.name) {
    throw new Error('Cannot delete the active profile. Switch to another profile first.');
  }
  if (options.name === 'default') {
    throw new Error('Cannot delete the default profile.');
  }

  const dir = path.join(profiles, options.name);
  if (!(await fs.pathExists(dir))) {
    throw new Error(`Profile "${options.name}" not found`);
  }

  const release = await acquireLock(lockFile);
  try {
    log.step(`Deleting profile "${options.name}"...`);
    await fs.remove(dir);
    await removeProfile(configFile, options.name);
    log.success(`Profile "${options.name}" deleted`);
  } finally {
    await release();
  }
}
```

- [ ] **Step 4: Implement rename**

```typescript
// src/commands/rename.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger.js';
import { readConfig, writeConfig } from '../core/config.js';
import { readProfileMeta, writeProfileMeta, validateProfileName } from '../core/profile.js';
import { switchSymlink } from '../core/symlink.js';
import { acquireLock } from '../core/lock.js';
import { PROFILES_DIR, CLAUDE_DIR } from '../core/paths.js';

interface RenameOptions {
  oldName: string;
  newName: string;
  claudeDir?: string;
  profilesDir?: string;
}

export async function runRename(options: RenameOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const claude = options.claudeDir ?? CLAUDE_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const lockFile = path.join(profiles, '.ccp.lock');

  const nameCheck = validateProfileName(options.newName);
  if (!nameCheck.valid) throw new Error(`Invalid name: ${nameCheck.reason}`);

  const oldDir = path.join(profiles, options.oldName);
  const newDir = path.join(profiles, options.newName);

  if (!(await fs.pathExists(oldDir))) throw new Error(`Profile "${options.oldName}" not found`);
  if (await fs.pathExists(newDir)) throw new Error(`Profile "${options.newName}" already exists`);

  const release = await acquireLock(lockFile);
  try {
    await fs.rename(oldDir, newDir);

    // Update .profile.json
    const metaPath = path.join(newDir, '.profile.json');
    const meta = await readProfileMeta(metaPath);
    meta.name = options.newName;
    await writeProfileMeta(metaPath, meta);

    // Update .ccp.json
    const config = await readConfig(configFile);
    config.profiles = config.profiles.map(p => p === options.oldName ? options.newName : p);
    if (config.active === options.oldName) {
      config.active = options.newName;
      await switchSymlink(newDir, claude);
    }
    await writeConfig(configFile, config);

    log.success(`Renamed "${options.oldName}" to "${options.newName}"`);
  } finally {
    await release();
  }
}
```

- [ ] **Step 5: Implement copy**

```typescript
// src/commands/copy.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger.js';
import { copyDir } from '../utils/fs.js';
import { addProfile } from '../core/config.js';
import { readProfileMeta, writeProfileMeta, createProfileMeta, validateProfileName } from '../core/profile.js';
import { initGit } from '../core/git.js';
import { PROFILES_DIR } from '../core/paths.js';

interface CopyOptions {
  source: string;
  target: string;
  profilesDir?: string;
}

export async function runCopy(options: CopyOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const srcDir = path.join(profiles, options.source);
  const dstDir = path.join(profiles, options.target);

  const nameCheck = validateProfileName(options.target);
  if (!nameCheck.valid) throw new Error(`Invalid name: ${nameCheck.reason}`);
  if (!(await fs.pathExists(srcDir))) throw new Error(`Profile "${options.source}" not found`);
  if (await fs.pathExists(dstDir)) throw new Error(`Profile "${options.target}" already exists`);

  log.step(`Copying "${options.source}" to "${options.target}"...`);
  await copyDir(srcDir, dstDir);

  // Remove .git, re-init
  await fs.remove(path.join(dstDir, '.git'));
  const meta = createProfileMeta(options.target, { description: `Copied from ${options.source}` });
  await writeProfileMeta(path.join(dstDir, '.profile.json'), meta);
  await initGit(dstDir, `init profile "${options.target}" (copied from "${options.source}")`);

  await addProfile(configFile, options.target);
  log.success(`Profile "${options.target}" created (copied from "${options.source}")`);
}
```

- [ ] **Step 6: Register all commands in bin/ccp.ts**

Add list, info, delete, rename, copy commands to CLI entry.

- [ ] **Step 7: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: implement list, info, delete, rename, copy commands"
```

---

## Chunk 5: Import/Export + Version Control Commands

### Task 16: Import Command

**Files:**
- Create: `src/commands/import.ts`
- Create: `tests/core/importer.test.ts`

- [ ] **Step 1: Write failing tests for importer**

```typescript
// tests/core/importer.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { createTempDir, cleanupTempDir, createMockClaudeDir } from '../helpers/setup.js';
import { importItems } from '../../src/core/importer.js';

describe('importer', () => {
  let tempDir: string;
  let sourceDir: string;
  let targetDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    sourceDir = await createMockClaudeDir(tempDir);
    targetDir = path.join(tempDir, 'target');
    await fs.ensureDir(targetDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should import auth files', async () => {
    await importItems(sourceDir, targetDir, ['auth']);
    expect(await fs.pathExists(path.join(targetDir, 'credentials.json'))).toBe(true);
  });

  it('should import skills directory', async () => {
    await fs.ensureDir(path.join(sourceDir, 'skills', 'test-skill'));
    await fs.writeFile(path.join(sourceDir, 'skills', 'test-skill', 'index.md'), 'skill');
    await importItems(sourceDir, targetDir, ['skills']);
    expect(await fs.pathExists(path.join(targetDir, 'skills', 'test-skill', 'index.md'))).toBe(true);
  });

  it('should merge settings fields for plugins', async () => {
    await fs.writeJson(path.join(sourceDir, 'settings.json'), {
      model: 'opus',
      enabledPlugins: { 'my-plugin': true },
      language: 'en',
    });
    await fs.writeJson(path.join(targetDir, 'settings.json'), {
      language: 'zh-CN',
    });
    await importItems(sourceDir, targetDir, ['plugins']);
    const settings = await fs.readJson(path.join(targetDir, 'settings.json'));
    expect(settings.enabledPlugins).toEqual({ 'my-plugin': true });
    expect(settings.language).toBe('zh-CN'); // Not overwritten
    expect(settings.model).toBeUndefined(); // Not copied
  });

  it('should not overwrite existing files in target when importing non-overlapping items', async () => {
    await fs.writeFile(path.join(targetDir, 'CLAUDE.md'), '# Keep me');
    await importItems(sourceDir, targetDir, ['auth']);
    const content = await fs.readFile(path.join(targetDir, 'CLAUDE.md'), 'utf8');
    expect(content).toBe('# Keep me');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/core/importer.test.ts`
Expected: FAIL

- [ ] **Step 3: Verify importer implementation passes** (already created in Task 13)

Run: `pnpm test -- tests/core/importer.test.ts`
Expected: All 4 tests PASS (may need minor adjustments)

- [ ] **Step 4: Implement import command**

```typescript
// src/commands/import.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger.js';
import { importItems } from '../core/importer.js';
import { autoCommit } from '../core/git.js';
import { PROFILES_DIR } from '../core/paths.js';

interface ImportOptions {
  target: string;
  from: string;
  profilesDir?: string;
  items?: string[];
  skipPrompts?: boolean;
}

export async function runImport(options: ImportOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const targetDir = path.join(profiles, options.target);
  const sourceDir = path.join(profiles, options.from);

  if (!(await fs.pathExists(targetDir))) throw new Error(`Target profile "${options.target}" not found`);
  if (!(await fs.pathExists(sourceDir))) throw new Error(`Source profile "${options.from}" not found`);
  if (!options.items?.length) throw new Error('No items selected for import');

  log.info(`Importing into "${options.target}" from "${options.from}"...`);
  log.step(`Items: ${options.items.join(', ')}`);

  await importItems(sourceDir, targetDir, options.items);
  await autoCommit(targetDir, `import ${options.items.join(', ')} from "${options.from}"`);

  log.success('Import complete');
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: implement import command with field-level settings merge"
```

---

### Task 17: Export + Import-Archive Commands

**Files:**
- Create: `src/commands/export.ts`
- Create: `src/commands/import-archive.ts`

- [ ] **Step 1: Implement export**

```typescript
// src/commands/export.ts
import path from 'node:path';
import fs from 'fs-extra';
import tar from 'tar';
import { log } from '../utils/logger.js';
import { PROFILES_DIR } from '../core/paths.js';

const DEFAULT_EXCLUDES = [
  '.git',
  'credentials.json',
  '.credentials',
  'stats-cache.json',
  'history.jsonl',
  'debug',
  'session-env',
  'shell-snapshots',
  'todos',
  'file-history',
  'backups',
  'plugins/cache',
  'plugins/marketplaces',
  'mcp-needs-auth-cache.json',
  'settings.local.json',
  '.DS_Store',
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

  if (!(await fs.pathExists(sourceDir))) {
    throw new Error(`Profile "${options.name}" not found`);
  }

  const excludes = [...DEFAULT_EXCLUDES];
  if (options.includeAuth) {
    const authFiles = ['credentials.json', '.credentials', 'stats-cache.json'];
    authFiles.forEach(f => {
      const idx = excludes.indexOf(f);
      if (idx !== -1) excludes.splice(idx, 1);
    });
  }
  if (options.includeHistory) {
    const idx = excludes.indexOf('history.jsonl');
    if (idx !== -1) excludes.splice(idx, 1);
  }

  const outputPath = options.output.endsWith('.tar.gz')
    ? options.output
    : `${options.output}/${options.name}.ccp.tar.gz`;

  await fs.ensureDir(path.dirname(outputPath));

  log.step(`Exporting "${options.name}" to ${outputPath}...`);

  await tar.create(
    {
      gzip: true,
      file: outputPath,
      cwd: profiles,
      filter: (entryPath) => {
        // Strip the profile name prefix safely
        const prefix = options.name + '/';
        const relative = entryPath.startsWith(prefix)
          ? entryPath.slice(prefix.length)
          : entryPath;
        if (!relative) return true; // the root directory entry itself
        return !excludes.some(ex => relative === ex || relative.startsWith(ex + '/') || relative.startsWith(ex));
      },
    },
    [options.name],
  );

  log.success(`Profile exported to ${outputPath}`);
}
```

- [ ] **Step 2: Implement import-archive**

```typescript
// src/commands/import-archive.ts
import path from 'node:path';
import fs from 'fs-extra';
import tar from 'tar';
import { log } from '../utils/logger.js';
import { addProfile } from '../core/config.js';
import { readProfileMeta, validateProfileName } from '../core/profile.js';
import { initGit } from '../core/git.js';
import { PROFILES_DIR } from '../core/paths.js';

interface ImportArchiveOptions {
  archivePath: string;
  name?: string;
  profilesDir?: string;
}

export async function runImportArchive(options: ImportArchiveOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');

  if (!(await fs.pathExists(options.archivePath))) {
    throw new Error(`Archive not found: ${options.archivePath}`);
  }

  // Extract to temp dir first to discover profile name
  const tempExtract = path.join(profiles, '.ccp-import-temp');
  await fs.ensureDir(tempExtract);

  try {
    await tar.extract({ file: options.archivePath, cwd: tempExtract });

    const entries = await fs.readdir(tempExtract);
    if (entries.length !== 1) {
      throw new Error('Invalid archive format: expected single profile directory');
    }

    const extractedName = entries[0];
    const targetName = options.name ?? extractedName;

    const nameCheck = validateProfileName(targetName);
    if (!nameCheck.valid) throw new Error(`Invalid name: ${nameCheck.reason}`);

    const targetDir = path.join(profiles, targetName);
    if (await fs.pathExists(targetDir)) {
      throw new Error(`Profile "${targetName}" already exists`);
    }

    await fs.rename(path.join(tempExtract, extractedName), targetDir);

    // Update profile name in metadata if renamed
    if (targetName !== extractedName) {
      const meta = await readProfileMeta(path.join(targetDir, '.profile.json'));
      meta.name = targetName;
      await fs.writeJson(path.join(targetDir, '.profile.json'), meta, { spaces: 2 });
    }

    // Init git (archive doesn't include .git)
    await initGit(targetDir, `imported from archive`);
    await addProfile(configFile, targetName);

    log.success(`Profile "${targetName}" imported from archive`);
  } finally {
    await fs.remove(tempExtract);
  }
}
```

- [ ] **Step 3: Register commands and commit**

```bash
git add -A
git commit -m "feat: implement export and import-archive commands"
```

---

### Task 18: Snapshot, History, Rollback Commands

**Files:**
- Create: `src/commands/snapshot.ts`
- Create: `src/commands/history.ts`
- Create: `src/commands/rollback.ts`

- [ ] **Step 1: Implement snapshot**

```typescript
// src/commands/snapshot.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger.js';
import { snapshot } from '../core/git.js';
import { PROFILES_DIR } from '../core/paths.js';

interface SnapshotOptions {
  name: string;
  message?: string;
  profilesDir?: string;
}

export async function runSnapshot(options: SnapshotOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const dir = path.join(profiles, options.name);
  if (!(await fs.pathExists(dir))) throw new Error(`Profile "${options.name}" not found`);

  const msg = options.message ?? `manual snapshot ${new Date().toISOString()}`;
  const committed = await snapshot(dir, msg);
  if (committed) {
    log.success(`Snapshot created for "${options.name}"`);
  } else {
    log.info(`No changes to snapshot for "${options.name}"`);
  }
}
```

- [ ] **Step 2: Implement history**

```typescript
// src/commands/history.ts
import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { log } from '../utils/logger.js';
import { getHistory } from '../core/git.js';
import { PROFILES_DIR } from '../core/paths.js';

interface HistoryOptions {
  name: string;
  count?: number;
  profilesDir?: string;
}

export async function runHistory(options: HistoryOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const dir = path.join(profiles, options.name);
  if (!(await fs.pathExists(dir))) throw new Error(`Profile "${options.name}" not found`);

  const entries = await getHistory(dir, options.count ?? 20);

  log.plain(`History for "${options.name}" (${entries.length} entries):\n`);
  for (const entry of entries) {
    log.plain(`  ${chalk.yellow(entry.hash.slice(0, 8))} ${chalk.gray(entry.date)} ${entry.message}`);
  }
}
```

- [ ] **Step 3: Implement rollback**

```typescript
// src/commands/rollback.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger.js';
import { getHistory, rollbackTo } from '../core/git.js';
import { select } from '@inquirer/prompts';
import { PROFILES_DIR } from '../core/paths.js';

interface RollbackOptions {
  name: string;
  commit?: string;
  profilesDir?: string;
  skipPrompts?: boolean;
}

export async function runRollback(options: RollbackOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const dir = path.join(profiles, options.name);
  if (!(await fs.pathExists(dir))) throw new Error(`Profile "${options.name}" not found`);

  let targetHash = options.commit;

  if (!targetHash && !options.skipPrompts) {
    const entries = await getHistory(dir, 20);
    if (entries.length <= 1) {
      throw new Error('No previous snapshots to rollback to');
    }

    targetHash = await select({
      message: 'Select snapshot to rollback to:',
      choices: entries.slice(1).map(e => ({
        name: `${e.hash} ${e.date} — ${e.message}`,
        value: e.hash,
      })),
    });
  }

  if (!targetHash) throw new Error('No commit specified');

  log.step(`Rolling back "${options.name}" to ${targetHash}...`);
  await rollbackTo(dir, targetHash);
  log.success(`Rolled back "${options.name}" to ${targetHash}`);
}
```

- [ ] **Step 4: Register commands and commit**

```bash
git add -A
git commit -m "feat: implement snapshot, history, rollback commands"
```

---

## Chunk 6: Doctor + CLI Wiring + README

### Task 19: Doctor Command

**Files:**
- Create: `src/commands/doctor.ts`

- [ ] **Step 1: Implement doctor**

```typescript
// src/commands/doctor.ts
import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { log } from '../utils/logger.js';
import { readConfig } from '../core/config.js';
import { isSymlink, verifySymlink } from '../core/symlink.js';
import { validateProfileDir } from '../core/profile.js';
import { PROFILES_DIR, CLAUDE_DIR } from '../core/paths.js';
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

  // Check symlink
  if (await isSymlink(claude)) {
    const config = await readConfig(configFile);
    const expectedTarget = path.join(profiles, config.active);
    if (await verifySymlink(claude, expectedTarget)) {
      pass(`~/.claude is symlink → ${expectedTarget}`);
    } else {
      fail(`~/.claude symlink target mismatch (expected ${expectedTarget})`);
    }
  } else {
    fail('~/.claude is not a symlink (ccp may be paused or not initialized)');
  }

  // Check .ccp.json
  if (await fs.pathExists(configFile)) {
    const config = await readConfig(configFile);
    pass(`.ccp.json valid, ${config.profiles.length} profiles registered`);

    // Check each profile
    let allDirsExist = true;
    for (const name of config.profiles) {
      const dir = path.join(profiles, name);
      if (await fs.pathExists(dir)) {
        const validation = await validateProfileDir(dir);
        if (validation.valid) {
          // Check git status
          const git = simpleGit(dir);
          const status = await git.status();
          if (!status.isClean()) {
            warn(`Profile "${name}" has uncommitted changes (run ccp snapshot ${name})`);
          }
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
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/doctor.ts
git commit -m "feat: implement doctor command for health checks"
```

---

### Task 20: Complete CLI Wiring

**Files:**
- Modify: `bin/ccp.ts`

- [ ] **Step 1: Wire all commands into CLI entry point**

Update `bin/ccp.ts` to register all 21 commands with their options and arguments. Each command follows the same pattern:

```typescript
program
  .command('<name>')
  .description('<desc>')
  .argument(...)
  .option('-y, --yes', 'Skip confirmation')
  .action(async (args, opts) => {
    try { await runCommand({ ...args, ...opts }); }
    catch (e: any) { console.error(e.message); process.exit(1); }
  });
```

Full list of commands to wire:
- init, pause, resume, uninstall
- create, delete, list, info, rename, copy
- activate, deactivate, launch, current
- import, export, import-archive
- snapshot, history, rollback
- doctor

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 3: Test CLI manually**

Run: `pnpm dev -- --help`
Expected: All commands listed with descriptions

- [ ] **Step 4: Commit**

```bash
git add bin/ccp.ts
git commit -m "feat: wire all commands into CLI entry point"
```

---

### Task 21: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

The README should include:
- Project description and motivation
- Installation (`npm install -g claude-code-profile`)
- Quick start (init → create → activate → launch)
- Full command reference table (copy from spec)
- Importable items table
- How version control works
- How status bar integration works
- Contributing guide (brief)
- License

- [ ] **Step 2: Build final package**

Run: `pnpm build`
Expected: Clean build, `dist/` directory created

- [ ] **Step 3: Test global install locally**

Run: `pnpm link --global && ccp --version`
Expected: `0.1.0`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: add README with full documentation"
```

---

## Integration Test Checklist

After all tasks are complete, run through this end-to-end flow manually:

- [ ] `ccp init` — migrates ~/.claude, creates backup
- [ ] `ccp list` — shows default (active)
- [ ] `ccp create reviewer` — interactive prompt, selective import
- [ ] `ccp create work --from default` — full clone
- [ ] `ccp list` — shows 3 profiles
- [ ] `ccp activate reviewer` — switches symlink
- [ ] `ccp current` — shows "reviewer"
- [ ] `ccp current --badge` — outputs "[reviewer]"
- [ ] `ccp launch work` — opens claude with CLAUDE_CONFIG_DIR
- [ ] `ccp snapshot reviewer -m "initial setup"` — creates git commit
- [ ] `ccp history reviewer` — shows commit log
- [ ] `ccp import work --from default` — selective import
- [ ] `ccp export reviewer -o /tmp/reviewer.ccp.tar.gz` — creates archive
- [ ] `ccp import-archive /tmp/reviewer.ccp.tar.gz` — imports from archive
- [ ] `ccp info reviewer` — shows metadata and disk usage
- [ ] `ccp copy work work-backup` — copies profile
- [ ] `ccp rename work-backup archived` — renames
- [ ] `ccp delete archived` — deletes
- [ ] `ccp doctor` — health check
- [ ] `ccp deactivate` — back to default
- [ ] `ccp pause` — restores ~/.claude
- [ ] `ccp resume` — re-enables symlink
- [ ] `ccp uninstall` — full teardown
