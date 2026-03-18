# Plugin Shared Store Design

pnpm-style shared storage for Claude Code plugins across profiles.

## Problem

Each profile copies the entire `plugins/` directory (~1GB). Multiple profiles with overlapping plugins waste disk space linearly.

## Solution

Centralized store at `$CCP_STORE` (default `$CCP_HOME/.store`). Profiles hold symlinks to store entries instead of real plugin directories.

## Data Model

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CCP_HOME` | `~/.claude-profiles` | Profiles root directory |
| `CCP_STORE` | `$CCP_HOME/.store` | Shared store root (independently configurable) |

Both injected into shell rc during `ccp init` alongside existing completion setup.

### Store Structure

```
$CCP_STORE/
├── cache/
│   ├── claude-plugins-official/
│   │   ├── superpowers/              # plugin entity (contains version subdirs)
│   │   │   └── 5.0.0/
│   │   ├── context7/
│   │   │   ├── 205b6e0b3036/
│   │   │   └── bd041495bd2a/         # multiple versions coexist
│   │   └── playwright/
│   │       └── 205b6e0b3036/
│   └── thedotmack/
│       └── claude-mem/
│           └── 10.5.2/
└── marketplaces/
    ├── claude-plugins-official/
    └── claude-dashboard/
```

### Profile plugins/ Structure (after store migration)

```
profile/plugins/
├── cache/
│   ├── claude-plugins-official/          # real directory (marketplace level)
│   │   ├── superpowers → $CCP_STORE/cache/claude-plugins-official/superpowers
│   │   ├── context7 → $CCP_STORE/cache/claude-plugins-official/context7
│   │   └── playwright → $CCP_STORE/cache/claude-plugins-official/playwright
│   └── thedotmack/                       # real directory
│       └── claude-mem → $CCP_STORE/cache/thedotmack/claude-mem
├── marketplaces → $CCP_STORE/marketplaces
├── installed_plugins.json                # per-profile
├── blocklist.json                        # per-profile
├── known_marketplaces.json               # per-profile
└── install-counts-cache.json             # per-profile
```

### Key Rules

1. **Symlink granularity**: Plugin-name level (e.g., `superpowers/` is symlink). Marketplace directories (e.g., `claude-plugins-official/`) are real directories.
2. **Symlink format**: Absolute paths (resolved `$CCP_STORE` value).
3. **Store is append-only**: Entries never auto-deleted. Cleanup via `ccp gc`.
4. **Metadata is per-profile**: `installed_plugins.json` etc. stay local, controlling which plugins each profile enables.

### .ccp.json

```json
{
  "version": 2,
  "active": "default",
  "profiles": ["default", "reviewer"],
  "createdAt": "...",
  "store": "/Users/mac/.claude-profiles/.store"
}
```

## Lazy Migration

Claude Code installs plugins directly to `plugins/cache/` (ccp cannot intercept). Non-symlink entries are detected and migrated to store at lifecycle boundaries.

### Trigger Points

| Command | When |
|---------|------|
| `activate` | Before snapshot of current profile |
| `snapshot` | Before committing |
| `pause` | Before snapshot (ensures store is up-to-date) |
| `resume` | After syncing `~/.claude` back to profile |

### Migration Strategy: copy → verify → delete → symlink

1. `fs.copy(profile/cache/plugin, $CCP_STORE/cache/.../plugin)`
2. Verify target integrity
3. `fs.remove(profile/cache/plugin)`
4. `fs.symlink($CCP_STORE/cache/.../plugin, profile/cache/plugin)`

### Version Merging

When store already has a plugin entry, merge version subdirectories:
- Existing versions in store: skip
- New versions not in store: copy in

### Safety

- `isClaudeRunning()` check already exists at activate/pause, ensuring no concurrent writes during migration.
- Idempotent: symlinks are skipped.
- Store entries already exist: merge, don't overwrite.

## Dereference Mechanism

Reverse of migration — pause/uninstall/export need real directories.

### Core Function: `dereferencePlugins(dir)`

1. Walk `plugins/cache/` — for each symlink: readlink → copy target back → remove symlink
2. Handle `marketplaces/` symlink the same way
3. Dangling symlinks: warn + remove (don't fail)

### Usage

| Command | How |
|---------|-----|
| `pause` | `copyDir(profile → ~/.claude)` then `dereferencePlugins(~/.claude)` |
| `uninstall` | Same as pause + clean env vars from rc file |
| `export` | Copy profile to temp dir, `dereferencePlugins(temp)`, tar temp dir |

## Command Impact

### init

Insert after integrity check, before git init:
1. Create `$CCP_STORE/cache/` and `$CCP_STORE/marketplaces/`
2. `migratePluginsToStore(defaultProfile)`
3. `migrateMarketplacesToStore(defaultProfile)`
4. Git init records store-migrated state

Shell rc injection: add `export CCP_HOME=...` and `export CCP_STORE=...` alongside existing completion eval.

Rollback: if migration fails, copy store entries back, delete store.

### create

| Path | Behavior |
|------|----------|
| Empty | No `plugins/cache/` created. Claude creates it on first plugin install. |
| `--from` full clone | Copy symlinks as-is (same store targets). Non-symlink entries: migrate to store first. |
| Selective import | Copy symlinks as-is. Metadata files copied normally. |

### activate

Before snapshot: `migratePluginsToStore(currentProfile)` then `autoCommit`.

### pause

After `copyDir(profile → ~/.claude)`: `dereferencePlugins(~/.claude)`.

### resume

After syncing `~/.claude` → profile: `migratePluginsToStore(profile)` then commit.

### uninstall

Same as pause + remove `CCP_HOME`/`CCP_STORE` exports from shell rc.

### import

Plugins import: copy symlinks (not dereference). `marketplaces/` → create symlink to store. Metadata files copied normally.

### export

Copy profile to temp dir → `dereferencePlugins(temp)` → tar. Self-contained archive.

### copy

Same as create `--from`.

### snapshot/rollback

- snapshot: git tracks symlink targets (text). No special handling.
- rollback: restores symlinks. Store is append-only, so old targets remain valid.
- Edge case: `ccp gc` removed old version, then rollback → dangling. `doctor` detects.

### doctor

New checks:
- Store directory exists and writable
- All profile cache symlinks are valid (not dangling)
- Marketplaces symlink valid
- Non-symlink entries in cache (suggest migration)
- `CCP_HOME` / `CCP_STORE` env vars set

### delete

No change. `fs.remove` profile directory. Orphaned store entries cleaned by `ccp gc`.

### rename / launch / history / info / list

No impact. Symlinks point to store (absolute path), not affected by profile name or `CLAUDE_CONFIG_DIR`.

## New Command: `ccp gc`

```bash
ccp gc        # Interactive: list orphaned entries, confirm before delete
ccp gc -y     # Silent: delete all orphaned entries
```

Logic:
1. Collect all symlink targets from all profiles' `plugins/cache/`
2. Walk `$CCP_STORE/cache/` entries
3. Entries not in reference set → orphans
4. Confirm + delete

## File Changes

### New Files

| File | Responsibility |
|------|---------------|
| `src/core/store.ts` | `migratePluginsToStore`, `migrateMarketplacesToStore`, `dereferencePlugins`, `mergePluginVersions` |
| `src/commands/gc.ts` | `runGc` command |
| `tests/core/store.test.ts` | Store migration/dereference/gc tests |
| `tests/commands/gc.test.ts` | gc command tests |

### Modified Files

| File | Change |
|------|--------|
| `src/core/paths.ts` | Add `CCP_HOME`, `CCP_STORE` constants |
| `bin/ccp.ts` | Register `gc` subcommand + startup env validation |
| `src/commands/init.ts` | Create store + migrate default plugins + inject env vars |
| `src/commands/create.ts` | Preserve symlinks on clone/import |
| `src/commands/activate.ts` | Lazy migration before snapshot |
| `src/commands/pause.ts` | Dereference after copyDir |
| `src/commands/resume.ts` | Re-migrate after sync |
| `src/commands/uninstall.ts` | Dereference + clean env vars from rc |
| `src/commands/export.ts` | Dereference to temp dir before tar |
| `src/commands/snapshot.ts` | Lazy migration before commit |
| `src/commands/import.ts` | Copy symlinks for plugins import |
| `src/commands/copy.ts` | Same as create --from |
| `src/commands/doctor.ts` | New store/symlink/env checks |
| `src/core/config.ts` | CcpConfig type: add `store` field, version `2` |

### Unchanged Files

`rollback.ts`, `history.ts`, `info.ts`, `list.ts`, `launch.ts`, `delete.ts`, `rename.ts` — no impact from store mechanism.
