# Plugin Shared Store Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement pnpm-style shared plugin storage so multiple profiles share plugin entities via symlinks instead of full copies.

**Architecture:** Centralized store at `$CCP_STORE` (default `$CCP_HOME/.store`) holds plugin entities. Each profile's `plugins/cache/` contains symlinks at plugin-name level pointing to store entries. Lazy migration detects non-symlink entries at lifecycle boundaries (activate/snapshot/pause/resume) and moves them to store. Dereference reverses this for pause/uninstall/export.

**Tech Stack:** Node.js, TypeScript, fs-extra, simple-git, commander

**Spec:** `docs/specs/2026-03-18-plugin-store-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/core/store.ts` | Core store operations: migrate plugins to store, dereference symlinks back to real dirs, merge plugin versions, scan for orphans |
| `src/commands/gc.ts` | `runGc` command: find orphaned store entries and delete them |
| `tests/core/store.test.ts` | Tests for all store.ts functions |
| `tests/commands/gc.test.ts` | Tests for gc command |

### Modified Files

| File | Lines affected | What changes |
|------|---------------|-------------|
| `src/core/paths.ts:1-45` | Add `CCP_HOME`, `CCP_STORE` constants derived from env vars |
| `src/core/config.ts:3-8` | Add `store` field to `CcpConfig` interface, bump default version to 2 |
| `src/commands/init.ts:36-68` | Create store dir, migrate default profile plugins, inject env vars into shell rc |
| `src/commands/create.ts:51-81` | Preserve symlinks on clone, create symlinks on selective import |
| `src/commands/activate.ts:39-41` | Call lazy migration before snapshot |
| `src/commands/snapshot.ts:12-15` | Call lazy migration before commit |
| `src/commands/pause.ts:44-48` | Call dereference after copyDir |
| `src/commands/resume.ts:33-43` | Call re-migration after sync |
| `src/commands/uninstall.ts:43-50` | Call dereference after copyDir, clean env vars from rc |
| `src/commands/export.ts:8-13,45-58` | Remove cache/marketplaces from excludes, dereference in temp dir |
| `src/commands/import.ts:38` | Make importer handle symlinks for plugins |
| `src/commands/copy.ts:29` | Ensure copyDir preserves symlinks |
| `src/commands/doctor.ts:59-82` | Add store/symlink/env checks |
| `src/core/importer.ts:6` | Update plugins import to copy symlinks |
| `bin/ccp.ts` | Register `gc` subcommand, add startup env validation |

---

## Chunk 1: Foundation (paths, config, store core)

### Task 1: Add CCP_HOME and CCP_STORE to paths.ts

**Files:**
- Modify: `src/core/paths.ts:1-9`

- [ ] **Step 1: Add environment-based constants**

In `src/core/paths.ts`, add after line 4 (`const home = ...`):

```typescript
export const CCP_HOME = process.env.CCP_HOME || path.join(home, '.claude-profiles');
export const CCP_STORE = process.env.CCP_STORE || path.join(CCP_HOME, '.store');
```

Update `PROFILES_DIR` to use `CCP_HOME`:

```typescript
export const PROFILES_DIR = CCP_HOME;
```

Remove the old hardcoded line:
```typescript
// DELETE: export const PROFILES_DIR = path.join(home, '.claude-profiles');
```

- [ ] **Step 2: Run existing tests to ensure no regression**

Run: `pnpm test`
Expected: All existing tests pass (PROFILES_DIR is aliased, not changed in meaning)

- [ ] **Step 3: Commit**

```bash
git add src/core/paths.ts
git commit -m "feat(store): add CCP_HOME and CCP_STORE constants to paths"
```

---

### Task 2: Update CcpConfig type and defaults

**Files:**
- Modify: `src/core/config.ts:3-19`

- [ ] **Step 1: Add store field to CcpConfig**

```typescript
export interface CcpConfig {
  version: number;
  active: string;
  profiles: string[];
  createdAt: string;
  store?: string;  // absolute path to shared store
}
```

Update `readConfig` default to version 2:

```typescript
return {
  version: 2,
  active: 'default',
  profiles: [],
  createdAt: new Date().toISOString(),
};
```

- [ ] **Step 2: Run existing tests**

Run: `pnpm test`
Expected: All pass. Config tests may need minor updates if they assert version === 1.

- [ ] **Step 3: Fix any failing tests**

If `tests/core/config.test.ts` asserts `version: 1`, update to `version: 2`.

- [ ] **Step 4: Commit**

```bash
git add src/core/config.ts tests/core/config.test.ts
git commit -m "feat(store): add store field to CcpConfig, bump default version to 2"
```

---

### Task 3: Create store.ts — migratePluginsToStore

**Files:**
- Create: `src/core/store.ts`
- Create: `tests/core/store.test.ts`

- [ ] **Step 1: Write failing test for migratePluginsToStore**

```typescript
// tests/core/store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import { migratePluginsToStore } from '../../src/core/store';

describe('migratePluginsToStore', () => {
  let tmpDir: string;
  let profileDir: string;
  let storeDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ccp-store-test-'));
    profileDir = path.join(tmpDir, 'profile');
    storeDir = path.join(tmpDir, 'store');
    await fs.ensureDir(storeDir);
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('should move plugin dirs to store and replace with symlinks', async () => {
    // Setup: real plugin directory
    const pluginDir = path.join(profileDir, 'plugins', 'cache', 'official', 'superpowers');
    await fs.ensureDir(path.join(pluginDir, '5.0.0'));
    await fs.writeFile(path.join(pluginDir, '5.0.0', 'plugin.json'), '{}');

    await migratePluginsToStore(profileDir, storeDir);

    // Plugin in profile should now be a symlink
    const stat = await fs.lstat(pluginDir);
    expect(stat.isSymbolicLink()).toBe(true);

    // Symlink should point to store
    const target = await fs.readlink(pluginDir);
    expect(target).toBe(path.join(storeDir, 'cache', 'official', 'superpowers'));

    // Store should have the plugin
    expect(await fs.pathExists(path.join(storeDir, 'cache', 'official', 'superpowers', '5.0.0', 'plugin.json'))).toBe(true);
  });

  it('should skip entries that are already symlinks', async () => {
    const pluginDir = path.join(profileDir, 'plugins', 'cache', 'official', 'superpowers');
    const storePlugin = path.join(storeDir, 'cache', 'official', 'superpowers');
    await fs.ensureDir(path.join(storePlugin, '5.0.0'));
    await fs.ensureDir(path.join(profileDir, 'plugins', 'cache', 'official'));
    await fs.symlink(storePlugin, pluginDir);

    await migratePluginsToStore(profileDir, storeDir);

    // Should still be a symlink, no error
    const stat = await fs.lstat(pluginDir);
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it('should merge versions when store already has the plugin', async () => {
    // Store has v1
    const storePlugin = path.join(storeDir, 'cache', 'official', 'context7');
    await fs.ensureDir(path.join(storePlugin, 'aaa'));
    await fs.writeFile(path.join(storePlugin, 'aaa', 'plugin.json'), '{"v":"aaa"}');

    // Profile has v1 + v2
    const pluginDir = path.join(profileDir, 'plugins', 'cache', 'official', 'context7');
    await fs.ensureDir(path.join(pluginDir, 'aaa'));
    await fs.writeFile(path.join(pluginDir, 'aaa', 'plugin.json'), '{"v":"aaa"}');
    await fs.ensureDir(path.join(pluginDir, 'bbb'));
    await fs.writeFile(path.join(pluginDir, 'bbb', 'plugin.json'), '{"v":"bbb"}');

    await migratePluginsToStore(profileDir, storeDir);

    // Store should have both versions
    expect(await fs.pathExists(path.join(storePlugin, 'aaa', 'plugin.json'))).toBe(true);
    expect(await fs.pathExists(path.join(storePlugin, 'bbb', 'plugin.json'))).toBe(true);

    // Profile should be symlink
    const stat = await fs.lstat(pluginDir);
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it('should do nothing if plugins/cache does not exist', async () => {
    await fs.ensureDir(profileDir);
    await migratePluginsToStore(profileDir, storeDir);
    // No error thrown
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/store.test.ts`
Expected: FAIL — `migratePluginsToStore` not found

- [ ] **Step 3: Implement migratePluginsToStore**

```typescript
// src/core/store.ts
import path from 'node:path';
import fs from 'fs-extra';
import { isSymlink } from './symlink';

/**
 * Migrate non-symlink plugin dirs from profile's plugins/cache/ to shared store.
 * Each plugin-name dir (e.g., superpowers/) becomes a symlink to the store.
 */
export async function migratePluginsToStore(profileDir: string, storeDir: string): Promise<void> {
  const cacheDir = path.join(profileDir, 'plugins', 'cache');
  if (!await fs.pathExists(cacheDir)) return;

  const marketplaces = await fs.readdir(cacheDir);
  for (const marketplace of marketplaces) {
    const marketplaceDir = path.join(cacheDir, marketplace);
    const stat = await fs.lstat(marketplaceDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;

    const plugins = await fs.readdir(marketplaceDir);
    for (const plugin of plugins) {
      const pluginPath = path.join(marketplaceDir, plugin);
      if (await isSymlink(pluginPath)) continue;

      const storePath = path.join(storeDir, 'cache', marketplace, plugin);

      if (await fs.pathExists(storePath)) {
        await mergePluginVersions(pluginPath, storePath);
      } else {
        await fs.copy(pluginPath, storePath, { preserveTimestamps: true });
      }

      await fs.remove(pluginPath);
      await fs.symlink(storePath, pluginPath);
    }
  }
}

async function mergePluginVersions(source: string, storeTarget: string): Promise<void> {
  const versions = await fs.readdir(source);
  for (const version of versions) {
    const srcVersion = path.join(source, version);
    const dstVersion = path.join(storeTarget, version);
    const stat = await fs.lstat(srcVersion);
    if (stat.isDirectory() && !await fs.pathExists(dstVersion)) {
      await fs.copy(srcVersion, dstVersion, { preserveTimestamps: true });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/core/store.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/store.ts tests/core/store.test.ts
git commit -m "feat(store): implement migratePluginsToStore with version merging"
```

---

### Task 4: Add migrateMarketplacesToStore

**Files:**
- Modify: `src/core/store.ts`
- Modify: `tests/core/store.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/core/store.test.ts`:

```typescript
import { migrateMarketplacesToStore } from '../../src/core/store';

describe('migrateMarketplacesToStore', () => {
  // ... same tmpDir/beforeEach/afterEach setup ...

  it('should move marketplaces dir to store and replace with symlink', async () => {
    const mpDir = path.join(profileDir, 'plugins', 'marketplaces');
    await fs.ensureDir(path.join(mpDir, 'official'));
    await fs.writeFile(path.join(mpDir, 'official', 'index.json'), '{}');

    await migrateMarketplacesToStore(profileDir, storeDir);

    const stat = await fs.lstat(mpDir);
    expect(stat.isSymbolicLink()).toBe(true);

    const target = await fs.readlink(mpDir);
    expect(target).toBe(path.join(storeDir, 'marketplaces'));

    expect(await fs.pathExists(path.join(storeDir, 'marketplaces', 'official', 'index.json'))).toBe(true);
  });

  it('should skip if marketplaces is already a symlink', async () => {
    const storeMp = path.join(storeDir, 'marketplaces');
    await fs.ensureDir(storeMp);
    const mpDir = path.join(profileDir, 'plugins', 'marketplaces');
    await fs.ensureDir(path.join(profileDir, 'plugins'));
    await fs.symlink(storeMp, mpDir);

    await migrateMarketplacesToStore(profileDir, storeDir);

    const stat = await fs.lstat(mpDir);
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it('should not overwrite existing store marketplaces', async () => {
    const storeMp = path.join(storeDir, 'marketplaces', 'official');
    await fs.ensureDir(storeMp);
    await fs.writeFile(path.join(storeMp, 'existing.json'), '{"from":"store"}');

    const mpDir = path.join(profileDir, 'plugins', 'marketplaces', 'official');
    await fs.ensureDir(mpDir);
    await fs.writeFile(path.join(mpDir, 'index.json'), '{}');

    await migrateMarketplacesToStore(profileDir, storeDir);

    // Store should keep existing file
    expect(await fs.pathExists(path.join(storeDir, 'marketplaces', 'official', 'existing.json'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/store.test.ts`
Expected: FAIL — `migrateMarketplacesToStore` not found

- [ ] **Step 3: Implement migrateMarketplacesToStore**

Add to `src/core/store.ts`:

```typescript
export async function migrateMarketplacesToStore(profileDir: string, storeDir: string): Promise<void> {
  const mpDir = path.join(profileDir, 'plugins', 'marketplaces');
  if (!await fs.pathExists(mpDir) || await isSymlink(mpDir)) return;

  const storeMpDir = path.join(storeDir, 'marketplaces');
  if (!await fs.pathExists(storeMpDir)) {
    await fs.copy(mpDir, storeMpDir, { preserveTimestamps: true });
  }
  await fs.remove(mpDir);
  await fs.symlink(storeMpDir, mpDir);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/core/store.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/store.ts tests/core/store.test.ts
git commit -m "feat(store): implement migrateMarketplacesToStore"
```

---

### Task 5: Add dereferencePlugins

**Files:**
- Modify: `src/core/store.ts`
- Modify: `tests/core/store.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/core/store.test.ts`:

```typescript
import { dereferencePlugins } from '../../src/core/store';

describe('dereferencePlugins', () => {
  // ... same tmpDir setup ...

  it('should replace cache symlinks with real directories', async () => {
    // Setup store with plugin
    const storePlugin = path.join(storeDir, 'cache', 'official', 'superpowers');
    await fs.ensureDir(path.join(storePlugin, '5.0.0'));
    await fs.writeFile(path.join(storePlugin, '5.0.0', 'plugin.json'), '{}');

    // Profile has symlink
    const pluginDir = path.join(profileDir, 'plugins', 'cache', 'official', 'superpowers');
    await fs.ensureDir(path.join(profileDir, 'plugins', 'cache', 'official'));
    await fs.symlink(storePlugin, pluginDir);

    await dereferencePlugins(profileDir);

    // Should now be a real directory
    const stat = await fs.lstat(pluginDir);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(stat.isDirectory()).toBe(true);

    // Content should be present
    expect(await fs.pathExists(path.join(pluginDir, '5.0.0', 'plugin.json'))).toBe(true);
  });

  it('should replace marketplaces symlink with real directory', async () => {
    const storeMp = path.join(storeDir, 'marketplaces');
    await fs.ensureDir(path.join(storeMp, 'official'));
    await fs.writeFile(path.join(storeMp, 'official', 'index.json'), '{}');

    const mpDir = path.join(profileDir, 'plugins', 'marketplaces');
    await fs.ensureDir(path.join(profileDir, 'plugins'));
    await fs.symlink(storeMp, mpDir);

    await dereferencePlugins(profileDir);

    const stat = await fs.lstat(mpDir);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(stat.isDirectory()).toBe(true);
    expect(await fs.pathExists(path.join(mpDir, 'official', 'index.json'))).toBe(true);
  });

  it('should remove dangling symlinks without error', async () => {
    const pluginDir = path.join(profileDir, 'plugins', 'cache', 'official', 'ghost');
    await fs.ensureDir(path.join(profileDir, 'plugins', 'cache', 'official'));
    await fs.symlink('/nonexistent/path', pluginDir);

    await dereferencePlugins(profileDir);

    // Dangling symlink should be removed
    expect(await fs.pathExists(pluginDir)).toBe(false);
  });

  it('should skip non-symlink entries', async () => {
    const pluginDir = path.join(profileDir, 'plugins', 'cache', 'official', 'superpowers');
    await fs.ensureDir(path.join(pluginDir, '5.0.0'));
    await fs.writeFile(path.join(pluginDir, '5.0.0', 'plugin.json'), '{}');

    await dereferencePlugins(profileDir);

    // Should remain a real directory, unchanged
    const stat = await fs.lstat(pluginDir);
    expect(stat.isDirectory()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/store.test.ts`
Expected: FAIL — `dereferencePlugins` not found

- [ ] **Step 3: Implement dereferencePlugins**

Add to `src/core/store.ts`:

```typescript
import { log } from '../utils/logger';

export async function dereferencePlugins(dir: string): Promise<void> {
  // 1. Cache entries
  const cacheDir = path.join(dir, 'plugins', 'cache');
  if (await fs.pathExists(cacheDir)) {
    const marketplaces = await fs.readdir(cacheDir);
    for (const marketplace of marketplaces) {
      const marketplaceDir = path.join(cacheDir, marketplace);
      const mpStat = await fs.lstat(marketplaceDir);
      if (!mpStat.isDirectory() || mpStat.isSymbolicLink()) continue;

      const plugins = await fs.readdir(marketplaceDir);
      for (const plugin of plugins) {
        const pluginPath = path.join(marketplaceDir, plugin);
        if (!await isSymlink(pluginPath)) continue;

        const target = await fs.readlink(pluginPath);
        if (!await fs.pathExists(target)) {
          log.warn(`Dangling symlink: ${pluginPath} -> ${target}, removing`);
          await fs.remove(pluginPath);
          continue;
        }
        await fs.remove(pluginPath);
        await fs.copy(target, pluginPath, { preserveTimestamps: true });
      }
    }
  }

  // 2. Marketplaces
  const mpPath = path.join(dir, 'plugins', 'marketplaces');
  if (await isSymlink(mpPath)) {
    const target = await fs.readlink(mpPath);
    if (await fs.pathExists(target)) {
      await fs.remove(mpPath);
      await fs.copy(target, mpPath, { preserveTimestamps: true });
    } else {
      log.warn(`Dangling symlink: ${mpPath}, removing`);
      await fs.remove(mpPath);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/core/store.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/store.ts tests/core/store.test.ts
git commit -m "feat(store): implement dereferencePlugins for pause/uninstall/export"
```

---

### Task 6: Add findOrphanedStoreEntries (for gc)

**Files:**
- Modify: `src/core/store.ts`
- Modify: `tests/core/store.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { findOrphanedStoreEntries } from '../../src/core/store';

describe('findOrphanedStoreEntries', () => {
  // ... same tmpDir setup, but with multiple profiles ...

  it('should find store entries not referenced by any profile', async () => {
    // Store has 2 plugins
    const storeA = path.join(storeDir, 'cache', 'official', 'superpowers');
    const storeB = path.join(storeDir, 'cache', 'official', 'orphan-plugin');
    await fs.ensureDir(path.join(storeA, '1.0'));
    await fs.ensureDir(path.join(storeB, '1.0'));

    // Profile only references superpowers
    const cacheDir = path.join(profileDir, 'plugins', 'cache', 'official');
    await fs.ensureDir(cacheDir);
    await fs.symlink(storeA, path.join(cacheDir, 'superpowers'));

    const orphans = await findOrphanedStoreEntries(storeDir, [profileDir]);

    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toBe(storeB);
  });

  it('should return empty array when all entries are referenced', async () => {
    const storeA = path.join(storeDir, 'cache', 'official', 'superpowers');
    await fs.ensureDir(path.join(storeA, '1.0'));

    const cacheDir = path.join(profileDir, 'plugins', 'cache', 'official');
    await fs.ensureDir(cacheDir);
    await fs.symlink(storeA, path.join(cacheDir, 'superpowers'));

    const orphans = await findOrphanedStoreEntries(storeDir, [profileDir]);
    expect(orphans).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/store.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement findOrphanedStoreEntries**

Add to `src/core/store.ts`:

```typescript
export async function findOrphanedStoreEntries(storeDir: string, profileDirs: string[]): Promise<string[]> {
  // Collect all symlink targets from all profiles
  const referenced = new Set<string>();
  for (const profileDir of profileDirs) {
    const cacheDir = path.join(profileDir, 'plugins', 'cache');
    if (!await fs.pathExists(cacheDir)) continue;
    const marketplaces = await fs.readdir(cacheDir);
    for (const marketplace of marketplaces) {
      const marketplaceDir = path.join(cacheDir, marketplace);
      const stat = await fs.lstat(marketplaceDir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
      const plugins = await fs.readdir(marketplaceDir);
      for (const plugin of plugins) {
        const pluginPath = path.join(marketplaceDir, plugin);
        if (await isSymlink(pluginPath)) {
          const target = await fs.readlink(pluginPath);
          referenced.add(target);
        }
      }
    }
  }

  // Walk store cache entries
  const orphans: string[] = [];
  const storeCacheDir = path.join(storeDir, 'cache');
  if (!await fs.pathExists(storeCacheDir)) return orphans;

  const storeMarketplaces = await fs.readdir(storeCacheDir);
  for (const marketplace of storeMarketplaces) {
    const marketplaceDir = path.join(storeCacheDir, marketplace);
    const stat = await fs.lstat(marketplaceDir);
    if (!stat.isDirectory()) continue;
    const plugins = await fs.readdir(marketplaceDir);
    for (const plugin of plugins) {
      const storePath = path.join(marketplaceDir, plugin);
      if (!referenced.has(storePath)) {
        orphans.push(storePath);
      }
    }
  }

  return orphans;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/core/store.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/store.ts tests/core/store.test.ts
git commit -m "feat(store): implement findOrphanedStoreEntries for gc"
```

---

## Chunk 2: Command Integration — Lifecycle

### Task 7: Update init command

**Files:**
- Modify: `src/commands/init.ts:7-10,36-68`
- Modify: `tests/commands/init.test.ts`

- [ ] **Step 1: Read current init test to understand test patterns**

Read: `tests/commands/init.test.ts`

- [ ] **Step 2: Add test for store creation during init**

Add test to `tests/commands/init.test.ts`:

```typescript
it('should create plugin store and migrate plugins', async () => {
  // Setup: create ~/.claude with plugins/cache
  const pluginDir = path.join(claudeDir, 'plugins', 'cache', 'official', 'test-plugin');
  await fs.ensureDir(path.join(pluginDir, '1.0'));
  await fs.writeFile(path.join(pluginDir, '1.0', 'plugin.json'), '{}');

  await runInit({ claudeDir, profilesDir, skipConfirm: true });

  // Store should exist
  const storeDir = path.join(profilesDir, '.store');
  expect(await fs.pathExists(storeDir)).toBe(true);

  // Plugin in default profile should be symlink
  const defaultPlugin = path.join(profilesDir, 'default', 'plugins', 'cache', 'official', 'test-plugin');
  const stat = await fs.lstat(defaultPlugin);
  expect(stat.isSymbolicLink()).toBe(true);

  // Store should have plugin
  expect(await fs.pathExists(path.join(storeDir, 'cache', 'official', 'test-plugin', '1.0', 'plugin.json'))).toBe(true);

  // Config should have store field
  const config = await fs.readJson(path.join(profilesDir, '.ccp.json'));
  expect(config.store).toBe(storeDir);
  expect(config.version).toBe(2);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/commands/init.test.ts`
Expected: FAIL — store not created

- [ ] **Step 4: Update init.ts**

Add imports:

```typescript
import { CCP_STORE } from '../core/paths';
import { migratePluginsToStore, migrateMarketplacesToStore } from '../core/store';
```

After integrity check (line ~48), before git init (line ~68), add:

```typescript
// Migrate plugins to shared store
const storeDir = CCP_STORE;
log.step('Setting up shared plugin store...');
await fs.ensureDir(path.join(storeDir, 'cache'));
await migratePluginsToStore(defaultProfile, storeDir);
await migrateMarketplacesToStore(defaultProfile, storeDir);
```

Update `writeConfig` call (line ~81) to include store:

```typescript
await writeConfig(configFile, {
  version: 2,
  active: 'default',
  profiles: ['default'],
  createdAt: new Date().toISOString(),
  store: storeDir,
});
```

Update `setupShellCompletion` to also inject env vars. Add after the completion snippet:

```typescript
const envSnippet = `export CCP_HOME="${profiles}"\nexport CCP_STORE="${storeDir}"\n`;
```

Integrate this into the existing shell rc writing logic in `setupShellCompletion`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/commands/init.test.ts`
Expected: All PASS

- [ ] **Step 6: Run full test suite**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/commands/init.ts tests/commands/init.test.ts
git commit -m "feat(store): integrate store creation and migration into init"
```

---

### Task 8: Update activate command — lazy migration

**Files:**
- Modify: `src/commands/activate.ts:39-41`

- [ ] **Step 1: Add lazy migration before snapshot**

Add import:

```typescript
import { readConfig } from '../core/config';
import { migratePluginsToStore, migrateMarketplacesToStore } from '../core/store';
```

Before `autoCommit` (line 40), add:

```typescript
if (config.store) {
  await migratePluginsToStore(currentDir, config.store);
  await migrateMarketplacesToStore(currentDir, config.store);
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: All PASS (activate tests use force: true, no plugins in test fixtures)

- [ ] **Step 3: Commit**

```bash
git add src/commands/activate.ts
git commit -m "feat(store): lazy migration in activate before snapshot"
```

---

### Task 9: Update snapshot command — lazy migration

**Files:**
- Modify: `src/commands/snapshot.ts`

- [ ] **Step 1: Add lazy migration before autoCommit**

```typescript
import path from 'node:path';
import { readConfig } from '../core/config';
import { migratePluginsToStore, migrateMarketplacesToStore } from '../core/store';
import { PROFILES_DIR } from '../core/paths';

export async function runSnapshot(options: SnapshotOptions): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const dir = await resolveProfileDir(options.name, options.profilesDir);

  const config = await readConfig(configFile);
  if (config.store) {
    await migratePluginsToStore(dir, config.store);
    await migrateMarketplacesToStore(dir, config.store);
  }

  const msg = options.message ?? `manual snapshot ${new Date().toISOString()}`;
  const committed = await autoCommit(dir, msg, 'snapshot');
  if (committed) log.success(`Snapshot created for "${options.name}"`);
  else log.info(`No changes to snapshot for "${options.name}"`);
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/commands/snapshot.ts
git commit -m "feat(store): lazy migration in snapshot before commit"
```

---

### Task 10: Update pause command — dereference

**Files:**
- Modify: `src/commands/pause.ts:44-48`

- [ ] **Step 1: Add dereference after copyDir**

Add import:

```typescript
import { dereferencePlugins } from '../core/store';
```

After `copyDir(activeDir, claude)` (line 46), add:

```typescript
await dereferencePlugins(claude);
```

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/commands/pause.ts
git commit -m "feat(store): dereference plugins on pause"
```

---

### Task 11: Update resume command — re-migration

**Files:**
- Modify: `src/commands/resume.ts:33-43`

- [ ] **Step 1: Add re-migration after sync**

Add imports:

```typescript
import { migratePluginsToStore, migrateMarketplacesToStore } from '../core/store';
```

After `injectStatusBadge` block (line ~41), before `autoCommit` (line 43), add:

```typescript
if (config.store) {
  await migratePluginsToStore(activeDir, config.store);
  await migrateMarketplacesToStore(activeDir, config.store);
}
```

Note: `config` is already read at line 28.

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/commands/resume.ts
git commit -m "feat(store): re-migrate plugins to store on resume"
```

---

### Task 12: Update uninstall command — dereference + env cleanup

**Files:**
- Modify: `src/commands/uninstall.ts:43-50`

- [ ] **Step 1: Add dereference after copyDir**

Add import:

```typescript
import { dereferencePlugins } from '../core/store';
```

After `copyDir(activeDir, claude)` (line 45), add:

```typescript
await dereferencePlugins(claude);
```

- [ ] **Step 2: Add env var cleanup from shell rc**

Add a function to remove CCP env vars from rc file (or add to init.ts and export):

After `restoreStatusLine` (line 47), add:

```typescript
await cleanShellEnvVars();
```

Implement `cleanShellEnvVars` as a private function in uninstall.ts (or shared in init.ts):

```typescript
async function cleanShellEnvVars(): Promise<void> {
  const shell = process.env.SHELL || '';
  const home = os.homedir();
  let rcFile: string | null = null;

  if (shell.endsWith('/zsh')) rcFile = path.join(home, '.zshrc');
  else if (shell.endsWith('/bash')) {
    const bashrc = path.join(home, '.bashrc');
    rcFile = (await fs.pathExists(bashrc)) ? bashrc : path.join(home, '.bash_profile');
  } else if (shell.endsWith('/fish')) {
    rcFile = path.join(home, '.config', 'fish', 'config.fish');
  }

  if (!rcFile || !await fs.pathExists(rcFile)) return;

  let content = await fs.readFile(rcFile, 'utf-8');
  // Remove CCP env vars and completion
  content = content.replace(/\n# ccp shell completion\n[^\n]*\n(export CCP_HOME="[^"]*"\n)?(export CCP_STORE="[^"]*"\n)?/g, '');
  await fs.writeFile(rcFile, content);
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/commands/uninstall.ts
git commit -m "feat(store): dereference plugins and clean env vars on uninstall"
```

---

## Chunk 3: Command Integration — Profile Management

### Task 13: Update create command — preserve symlinks

**Files:**
- Modify: `src/commands/create.ts:51-81`

- [ ] **Step 1: Update full clone path to preserve symlinks**

The key change: when cloning `--from`, the `copyDir` call (line 54) copies symlinks as real dirs by default. We need to ensure symlinks in `plugins/cache/` are preserved.

After `copyDir(sourceDir, targetDir)` and `.git` removal (lines 54-55), add:

```typescript
// Ensure plugin cache symlinks point to store (copyDir may dereference)
const config = await readConfig(path.join(profiles, '.ccp.json'));
if (config.store) {
  await migratePluginsToStore(targetDir, config.store);
  await migrateMarketplacesToStore(targetDir, config.store);
}
```

Add imports:

```typescript
import { readConfig } from '../core/config';
import { migratePluginsToStore, migrateMarketplacesToStore } from '../core/store';
```

This approach is simpler than modifying `copyDir` — let it copy normally, then re-migrate. The store already has the entries so migration is just delete + symlink (no copy needed).

- [ ] **Step 2: Update selective import path**

For the empty profile with selective import (line 75-80), the `importItems` function handles plugins. This will be updated in Task 15 (importer.ts).

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/commands/create.ts
git commit -m "feat(store): re-migrate plugins to store after clone in create"
```

---

### Task 14: Update copy command — preserve symlinks

**Files:**
- Modify: `src/commands/copy.ts:29`

- [ ] **Step 1: Add re-migration after copy**

Same pattern as create. After `copyDir` (line 29) and `.git` removal (line 32), add:

```typescript
import { readConfig } from '../core/config';
import { migratePluginsToStore, migrateMarketplacesToStore } from '../core/store';

// ... inside runCopy, after line 32:
const config = await readConfig(configFile);
if (config.store) {
  await migratePluginsToStore(targetDir, config.store);
  await migrateMarketplacesToStore(targetDir, config.store);
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/commands/copy.ts
git commit -m "feat(store): re-migrate plugins to store after copy"
```

---

### Task 15: Update importer — handle symlinks for plugins

**Files:**
- Modify: `src/core/importer.ts:6,16-28`

- [ ] **Step 1: Update plugins import logic**

The current import logic uses `fs.copy` for `plugins/` directory. When source has symlinks, `fs.copy` may dereference them. We need to handle this.

Simplest approach: after `importItems` copies plugins, re-migrate in the calling command. But `importItems` is also called from `create.ts` line 79. The calling commands already handle re-migration (Task 13).

**No change needed in importer.ts** — the calling commands (create, import) will re-migrate after import. This is the cleanest approach since `importItems` is a generic utility.

However, for `src/commands/import.ts`, add re-migration after `importItems`:

```typescript
import { readConfig } from '../core/config';
import { migratePluginsToStore, migrateMarketplacesToStore } from '../core/store';

// After importItems (line 38):
if (options.items.includes('plugins')) {
  const config = await readConfig(path.join(profiles, '.ccp.json'));
  if (config.store) {
    await migratePluginsToStore(targetDir, config.store);
    await migrateMarketplacesToStore(targetDir, config.store);
  }
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/commands/import.ts
git commit -m "feat(store): re-migrate after plugin import"
```

---

### Task 16: Update export command — dereference before tar

**Files:**
- Modify: `src/commands/export.ts:8-13,45-58`

- [ ] **Step 1: Update export to dereference plugins**

The current export excludes `plugins/cache` and `plugins/marketplaces` (line 11). With store, we want to **include** them but dereference first.

Strategy: copy profile to temp dir → dereference → tar temp dir → cleanup.

```typescript
import { dereferencePlugins } from '../core/store';
import os from 'node:os';

// Remove 'plugins/cache' and 'plugins/marketplaces' from DEFAULT_EXCLUDES
const DEFAULT_EXCLUDES = [
  '.git', 'credentials.json', '.credentials', 'stats-cache.json',
  'history.jsonl', 'debug', 'session-env', 'shell-snapshots',
  'todos', 'file-history', 'backups',
  'mcp-needs-auth-cache.json', 'settings.local.json', '.DS_Store',
];

// In runExport, replace tarCreate block:
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
```

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/commands/export.ts
git commit -m "feat(store): dereference plugins in export for self-contained archives"
```

---

## Chunk 4: Doctor, GC, and CLI Registration

### Task 17: Update doctor — add store checks

**Files:**
- Modify: `src/commands/doctor.ts:59-82`

- [ ] **Step 1: Add store health checks**

Add imports:

```typescript
import { CCP_STORE } from '../core/paths';
import { findOrphanedStoreEntries } from '../core/store';
```

After existing profile checks (before the summary line ~84), add:

```typescript
// Store checks
log.plain('\nPlugin Store:');
const storeDir = config.store || CCP_STORE;

if (await fs.pathExists(storeDir)) {
  pass(`Store directory exists: ${storeDir}`);

  // Check for dangling symlinks in profiles
  for (const name of config.profiles) {
    const cacheDir = path.join(profiles, name, 'plugins', 'cache');
    if (!await fs.pathExists(cacheDir)) continue;
    const marketplaces = await fs.readdir(cacheDir);
    for (const marketplace of marketplaces) {
      const mpDir = path.join(cacheDir, marketplace);
      const mpStat = await fs.lstat(mpDir);
      if (!mpStat.isDirectory() || mpStat.isSymbolicLink()) continue;
      const plugins = await fs.readdir(mpDir);
      for (const plugin of plugins) {
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

  // Check for orphans
  const profileDirs = config.profiles.map(n => path.join(profiles, n));
  const orphans = await findOrphanedStoreEntries(storeDir, profileDirs);
  if (orphans.length > 0) {
    warn(`${orphans.length} orphaned plugin(s) in store (run "ccp gc" to clean)`);
  }
} else {
  warn(`Store directory not found: ${storeDir}`);
}

// Env var check
if (!process.env.CCP_HOME) {
  warn('CCP_HOME environment variable not set. Run "source ~/.zshrc" or restart shell.');
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/commands/doctor.ts
git commit -m "feat(store): add store health checks to doctor"
```

---

### Task 18: Create gc command

**Files:**
- Create: `src/commands/gc.ts`
- Create: `tests/commands/gc.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/commands/gc.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import { runGc } from '../../src/commands/gc';

describe('runGc', () => {
  let tmpDir: string;
  let profilesDir: string;
  let storeDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ccp-gc-test-'));
    profilesDir = path.join(tmpDir, 'profiles');
    storeDir = path.join(tmpDir, 'profiles', '.store');
    await fs.ensureDir(storeDir);
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('should delete orphaned store entries', async () => {
    // Store has 2 plugins
    const storeA = path.join(storeDir, 'cache', 'official', 'superpowers');
    const storeB = path.join(storeDir, 'cache', 'official', 'orphan');
    await fs.ensureDir(path.join(storeA, '1.0'));
    await fs.ensureDir(path.join(storeB, '1.0'));

    // Profile references only superpowers
    const profileDir = path.join(profilesDir, 'default');
    const cacheDir = path.join(profileDir, 'plugins', 'cache', 'official');
    await fs.ensureDir(cacheDir);
    await fs.symlink(storeA, path.join(cacheDir, 'superpowers'));

    // Config
    await fs.writeJson(path.join(profilesDir, '.ccp.json'), {
      version: 2,
      active: 'default',
      profiles: ['default'],
      createdAt: new Date().toISOString(),
      store: storeDir,
    });

    await runGc({ profilesDir, skipConfirm: true });

    // Orphan should be deleted
    expect(await fs.pathExists(storeB)).toBe(false);
    // Referenced plugin should remain
    expect(await fs.pathExists(storeA)).toBe(true);
  });

  it('should do nothing when no orphans exist', async () => {
    const storeA = path.join(storeDir, 'cache', 'official', 'superpowers');
    await fs.ensureDir(path.join(storeA, '1.0'));

    const profileDir = path.join(profilesDir, 'default');
    const cacheDir = path.join(profileDir, 'plugins', 'cache', 'official');
    await fs.ensureDir(cacheDir);
    await fs.symlink(storeA, path.join(cacheDir, 'superpowers'));

    await fs.writeJson(path.join(profilesDir, '.ccp.json'), {
      version: 2, active: 'default', profiles: ['default'],
      createdAt: new Date().toISOString(), store: storeDir,
    });

    await runGc({ profilesDir, skipConfirm: true });

    expect(await fs.pathExists(storeA)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/commands/gc.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement gc command**

```typescript
// src/commands/gc.ts
import path from 'node:path';
import fs from 'fs-extra';
import { log } from '../utils/logger';
import { readConfig } from '../core/config';
import { findOrphanedStoreEntries } from '../core/store';
import { PROFILES_DIR } from '../core/paths';

interface GcOptions {
  profilesDir?: string;
  skipConfirm?: boolean;
}

export async function runGc(options: GcOptions = {}): Promise<void> {
  const profiles = options.profilesDir ?? PROFILES_DIR;
  const configFile = path.join(profiles, '.ccp.json');
  const config = await readConfig(configFile);

  if (!config.store) {
    log.info('Plugin store not configured.');
    return;
  }

  const profileDirs = config.profiles.map(n => path.join(profiles, n));
  const orphans = await findOrphanedStoreEntries(config.store, profileDirs);

  if (orphans.length === 0) {
    log.success('No orphaned plugins in store.');
    return;
  }

  log.info(`Found ${orphans.length} orphaned plugin(s):`);
  for (const orphan of orphans) {
    log.plain(`  - ${path.relative(config.store, orphan)}`);
  }

  if (!options.skipConfirm) {
    const { confirmAction } = await import('../ui/prompts.js');
    const confirmed = await confirmAction(`Delete ${orphans.length} orphaned plugin(s)?`);
    if (!confirmed) { log.info('Cancelled.'); return; }
  }

  for (const orphan of orphans) {
    await fs.remove(orphan);
  }

  // Clean up empty marketplace directories
  const storeCacheDir = path.join(config.store, 'cache');
  if (await fs.pathExists(storeCacheDir)) {
    const marketplaces = await fs.readdir(storeCacheDir);
    for (const marketplace of marketplaces) {
      const mpDir = path.join(storeCacheDir, marketplace);
      const remaining = await fs.readdir(mpDir);
      if (remaining.length === 0) {
        await fs.remove(mpDir);
      }
    }
  }

  log.success(`Removed ${orphans.length} orphaned plugin(s).`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/commands/gc.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/gc.ts tests/commands/gc.test.ts
git commit -m "feat(store): implement gc command for orphaned store cleanup"
```

---

### Task 19: Register gc in CLI + add env validation

**Files:**
- Modify: `bin/ccp.ts`

- [ ] **Step 1: Add gc import and command registration**

Add import at top:

```typescript
import { runGc } from '../src/commands/gc';
```

Add command registration after the `doctor` block (after line 340):

```typescript
program
  .command('gc')
  .description('Clean up orphaned plugins from shared store')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (opts) => {
    try {
      await runGc({ skipConfirm: opts.yes });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });
```

- [ ] **Step 2: Add startup env validation**

Before `program.parse()` (line 387), add:

```typescript
// Validate environment
import { CCP_HOME, CCP_STORE } from '../src/core/paths';
import fs from 'fs-extra';

if (process.env.CCP_HOME && !fs.existsSync(process.env.CCP_HOME)) {
  console.warn(`Warning: CCP_HOME (${process.env.CCP_HOME}) does not exist, using default`);
}
if (process.env.CCP_STORE && !fs.existsSync(process.env.CCP_STORE)) {
  console.warn(`Warning: CCP_STORE (${process.env.CCP_STORE}) does not exist`);
}
```

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dev gc --help`
Expected: Shows gc command help with `--yes` option

- [ ] **Step 5: Commit**

```bash
git add bin/ccp.ts
git commit -m "feat(store): register gc command and add env validation in CLI"
```

---

## Chunk 5: Final Integration Test

### Task 20: End-to-end integration test

**Files:**
- Modify: `tests/commands/lifecycle.test.ts`

- [ ] **Step 1: Read current lifecycle test**

Read: `tests/commands/lifecycle.test.ts` to understand the existing integration test pattern.

- [ ] **Step 2: Add store integration test**

Add a test that exercises the full lifecycle with store:

```typescript
it('should maintain store consistency across lifecycle', async () => {
  // Setup: claude dir with plugins
  const pluginDir = path.join(claudeDir, 'plugins', 'cache', 'official', 'test-plugin');
  await fs.ensureDir(path.join(pluginDir, '1.0'));
  await fs.writeFile(path.join(pluginDir, '1.0', 'plugin.json'), '{}');

  // Init
  await runInit({ claudeDir, profilesDir, skipConfirm: true });
  const storeDir = path.join(profilesDir, '.store');

  // Verify store created
  expect(await fs.pathExists(path.join(storeDir, 'cache', 'official', 'test-plugin', '1.0', 'plugin.json'))).toBe(true);

  // Create clone
  await runCreate({ name: 'work', from: 'default', profilesDir, skipPrompts: true });

  // Work profile should have symlink too
  const workPlugin = path.join(profilesDir, 'work', 'plugins', 'cache', 'official', 'test-plugin');
  const stat = await fs.lstat(workPlugin);
  expect(stat.isSymbolicLink()).toBe(true);

  // Pause — should dereference
  await runPause({ claudeDir, profilesDir, skipConfirm: true, force: true });
  const pausedPlugin = path.join(claudeDir, 'plugins', 'cache', 'official', 'test-plugin');
  const pausedStat = await fs.lstat(pausedPlugin);
  expect(pausedStat.isSymbolicLink()).toBe(false);
  expect(pausedStat.isDirectory()).toBe(true);

  // Resume — should re-migrate
  await runResume({ claudeDir, profilesDir, skipConfirm: true });
  const resumedPlugin = path.join(profilesDir, 'default', 'plugins', 'cache', 'official', 'test-plugin');
  const resumedStat = await fs.lstat(resumedPlugin);
  expect(resumedStat.isSymbolicLink()).toBe(true);

  // Store still intact
  expect(await fs.pathExists(path.join(storeDir, 'cache', 'official', 'test-plugin', '1.0', 'plugin.json'))).toBe(true);
});
```

- [ ] **Step 3: Run test**

Run: `pnpm vitest run tests/commands/lifecycle.test.ts`
Expected: All PASS

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tests/commands/lifecycle.test.ts
git commit -m "test(store): add end-to-end store lifecycle integration test"
```

---

## Summary

| Chunk | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-6 | Foundation: paths, config, store.ts core functions |
| 2 | 7-12 | Lifecycle commands: init, activate, snapshot, pause, resume, uninstall |
| 3 | 13-16 | Profile management: create, copy, import, export |
| 4 | 17-19 | Utilities: doctor, gc, CLI registration |
| 5 | 20 | End-to-end integration test |

**Total: 20 tasks, ~5 chunks, each independently committable.**
