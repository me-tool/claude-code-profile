# CCP (Claude Code Profile) Design Spec

## Overview

CCP is a Node CLI tool that brings Chrome-like profile management to Claude Code. Each profile is a fully isolated `~/.claude` equivalent with its own CLAUDE.md, settings, skills, hooks, plugins, and memory. Profiles can selectively import configuration from each other to reduce setup friction.

## Problem

Claude Code uses a single `~/.claude` directory for all configuration. Users who need multiple personas (e.g., a work profile with company-specific rules, a clean reviewer profile, a personal exploration profile) have no way to isolate these contexts. Switching between them requires manual file management.

## Core Concepts

- **Profile**: A complete, isolated Claude Code configuration directory (equivalent to `~/.claude`)
- **Active Profile**: The profile currently linked via `~/.claude` symlink
- **Import**: One-time copy of selected configuration items from one profile to another (not a reference — profiles evolve independently after import)
- **Snapshot**: A git commit capturing the current state of a profile's configuration

## Isolation Mechanism (Hybrid)

Two complementary mechanisms:

1. **Symlink switching (primary)**: `~/.claude` is a symlink managed by ccp, pointing to `~/.claude-profiles/<active>/`. `ccp activate <name>` changes the symlink target. Claude Code is completely unaware of ccp.

2. **Environment variable (parallel launch)**: `ccp launch <name>` starts Claude Code with `CLAUDE_CONFIG_DIR=~/.claude-profiles/<name>/`, allowing multiple profile instances to run simultaneously without changing the symlink.

### CLAUDE_CONFIG_DIR Verification

The `CLAUDE_CONFIG_DIR` environment variable is confirmed via Claude Code binary source analysis:

```
CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude')
```

This means Claude Code reads `CLAUDE_CONFIG_DIR` first, falling back to `~/.claude` if unset. This is an undocumented but stable internal mechanism. If it is ever removed in a future Claude Code version, `ccp launch` gracefully degrades — users can still use `ccp activate` (symlink switching) as the primary mechanism.

## Directory Structure

```
~/.claude-profiles/
  .ccp.json                        # Global metadata
  default/                         # Migrated from original ~/.claude
    .profile.json                  # Profile metadata
    .git/                          # Auto version control
    .gitignore
    CLAUDE.md
    settings.json
    settings.local.json
    plugins/
    skills/
    hooks/
    rules/
    projects/
    history.jsonl
    ...
  reviewer/
    .profile.json
    .git/
    CLAUDE.md
    ...
  work/
    ...

~/.claude -> ~/.claude-profiles/default/   # Symlink managed by ccp
```

### .ccp.json (global metadata)

```json
{
  "version": 1,
  "active": "default",
  "profiles": ["default", "reviewer", "work"],
  "createdAt": "2026-03-16T00:00:00Z"
}
```

### .profile.json (per-profile metadata)

```json
{
  "name": "reviewer",
  "description": "Clean review-only instance",
  "createdAt": "2026-03-16T00:00:00Z",
  "importedFrom": "default",
  "importedItems": ["auth", "plugins"],
  "originalStatusLine": {
    "type": "command",
    "command": "node /path/to/dashboard.js"
  }
}
```

## CLI Commands

### Lifecycle

| Command | Description |
|---------|-------------|
| `ccp init` | Migrate `~/.claude` to `~/.claude-profiles/default/`, create symlink, backup original |
| `ccp pause` | Suspend ccp, restore `~/.claude` as real directory from active profile |
| `ccp resume` | Re-enable ccp management, re-establish symlink |
| `ccp uninstall` | Fully exit ccp, restore `~/.claude`, preserve `~/.claude-profiles/` for manual cleanup |

### Profile Management

| Command | Description |
|---------|-------------|
| `ccp create <name>` | Interactive profile creation: prompts for source profile (or "skip" for empty), then selective import |
| `ccp create <name> --from <profile>` | Full clone from specified profile |
| `ccp delete <name>` | Delete profile (refuses active and default) |
| `ccp list` | List all profiles, mark active |
| `ccp info <name>` | Show profile details (metadata, disk usage) |
| `ccp rename <old> <new>` | Rename profile |
| `ccp copy <src> <dst>` | Copy a profile |

### Activation

| Command | Description |
|---------|-------------|
| `ccp activate <name>` | Switch active profile (change symlink), auto-snapshot previous |
| `ccp deactivate` | Return to default (equivalent to `ccp activate default`) |
| `ccp launch <name>` | Start claude with `CLAUDE_CONFIG_DIR` pointing to profile, no symlink change |
| `ccp current` | Show current active profile |
| `ccp current --badge` | Output `[name]` for status bar composition |

### Import/Export

| Command | Description |
|---------|-------------|
| `ccp import <target> --from <source>` | Interactive selective import into `<target>` from `<source>` profile |
| `ccp export <name> -o <path>` | Export profile as `.ccp.tar.gz` (excludes auth by default) |
| `ccp import-archive <path>` | Import profile from exported archive |

### Version Control

| Command | Description |
|---------|-------------|
| `ccp snapshot <name> [-m "msg"]` | Manual snapshot (git commit) |
| `ccp history <name>` | View profile change history (git log) |
| `ccp rollback <name>` | Interactive rollback to previous snapshot |

### Health

| Command | Description |
|---------|-------------|
| `ccp doctor` | Check symlink integrity, profile validity, git health |

All commands support `--yes/-y` to skip confirmation prompts.

## Importable Items

| Item | Files/Directories | Notes |
|------|-------------------|-------|
| `auth` | `credentials.json`, `.credentials`, `stats-cache.json` | Excluded from export by default |
| `plugins` | `plugins/` + `enabledPlugins` field in settings.json | Field-level merge into target settings |
| `skills` | `skills/` | |
| `hooks` | `hooks/` + `hooks` field in settings.json | Field-level merge into target settings |
| `mcp` | MCP server configs in settings.json | Field-level merge |
| `rules` | `rules/`, `constitution.md` | |
| `settings` | `settings.json`, `settings.local.json` | Full file copy |
| `memory` | `projects/*/memory/` | |
| `conversations` | `history.jsonl`, `projects/*/conversations/`, `session-env/` | |

When importing `plugins`, `hooks`, or `mcp`, the corresponding fields in `settings.json` are merged at field level (not file-level overwrite) to avoid clobbering other settings in the target profile.

## Version Control

Each profile directory is a git repository:

- `ccp init` / `ccp create`: `git init` + initial commit
- `ccp activate` / `ccp deactivate`: auto-commit if dirty ("auto: snapshot before deactivate")
- `ccp snapshot`: manual commit with optional message
- `ccp history`: `git log` formatted output
- `ccp rollback`: interactive commit selection + `git checkout <commit> -- .` + new commit (preserves full history, never uses `reset --hard`)

### .gitignore template

```gitignore
# Sensitive
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
```

Version-controlled files: `CLAUDE.md`, `settings.json`, `skills/`, `hooks/`, `rules/`, `constitution.md`, `.profile.json`

Note: `settings.local.json` is intentionally excluded from version control (contains machine-specific secrets/env vars) but is included in the `settings` importable item. This means `ccp rollback` will NOT roll back local settings — this is by design.

## Status Bar Integration

CCP does not override existing statusLine configuration. It composes:

- `ccp current --badge` outputs `[profile-name]`
- During `ccp init` / `ccp create`, the existing `statusLine.command` is recorded in `.profile.json` as `originalStatusLine`
- The new statusLine prepends (default) or appends the badge: `ccp current --badge && <existing_command>`
- `ccp pause` / `ccp uninstall` restores the original statusLine
- Position configurable via `ccp init --status-position first|last` (default: `first`)

## Safety Mechanisms

| Scenario | Protection |
|----------|-----------|
| `init` failure | Copy-then-verify-then-symlink; original backed up to `~/.claude-backup-<date>/`; rollback on any failure |
| `activate` while claude running | Detect claude process by name (`claude`) via `pgrep`; warn user (`--force` to override). Known limitation: does not detect Claude Code running as VS Code extension backend or via `npx`. |
| `delete` active profile | Refused |
| `delete default` | Refused (except during uninstall) |
| `export` auth leakage | Auth excluded by default; `--include-auth` required |
| Symlink corruption | `ccp doctor` detects; auto-repairs if `.ccp.json` is intact (re-creates symlink to active profile); prompts user if ambiguous |
| `rename` active profile | Automatically updates symlink target after rename |
| Concurrent ccp operations | File-based lock (`~/.claude-profiles/.ccp.lock`) prevents simultaneous activate/delete/rename |
| `pause` / `uninstall` | Restores real `~/.claude` directory from current active profile (not necessarily default) |

## Technical Stack

| Purpose | Library | Rationale |
|---------|---------|-----------|
| CLI framework | commander | Same as Claude Code, ecosystem alignment |
| Interactive prompts | @inquirer/prompts | Multi-select, confirm, list; ESM native |
| File operations | fs-extra | copy, ensureDir, move |
| Git operations | simple-git | Lightweight wrapper for init/add/commit/log/checkout |
| Archive | tar | export/import-archive |
| Terminal output | chalk | Colored output |

Build: TypeScript with tsup. Development: tsx.

## Project Structure

```
cc-profile/
  package.json
  tsconfig.json
  README.md
  LICENSE                          # MIT
  bin/
    ccp.ts                         # CLI entry point
  src/
    commands/                      # One file per command
      init.ts
      create.ts
      delete.ts
      list.ts
      info.ts
      rename.ts
      copy.ts
      activate.ts
      deactivate.ts
      launch.ts
      current.ts
      import.ts
      export.ts
      import-archive.ts
      pause.ts
      resume.ts
      uninstall.ts
      history.ts
      rollback.ts
      snapshot.ts
    core/
      paths.ts                     # Path constants
      profile.ts                   # Profile read/write/validate
      symlink.ts                   # Symlink create/switch/verify
      importer.ts                  # Import logic (per-category file copy + field merge)
      git.ts                       # Auto-commit, snapshot, history, rollback
      config.ts                    # .ccp.json read/write
    ui/
      prompts.ts                   # Inquirer prompts
    utils/
      fs.ts                        # File operations (copy, verify, atomic ops)
      logger.ts                    # Unified output formatting
  tests/
    core/
    commands/
```

## Export Archive Format

```
<profile-name>.ccp.tar.gz
  <profile-name>/
    .profile.json
    CLAUDE.md
    settings.json
    skills/
    hooks/
    rules/
    constitution.md
    plugins/
    .gitignore
```

Default exclusions: auth files, `history.jsonl`, `debug/`, `session-env/`, `.git/`

Flags: `--include-auth`, `--include-history`

Archive includes a format version in `.profile.json` for forward compatibility.

## Key Design Decisions

1. **Isolation model**: Full copy, not symlinks/references. Profiles evolve independently after import.
2. **Hybrid activation**: Symlink (primary, persistent) + CLAUDE_CONFIG_DIR (parallel launch).
3. **Version control**: Per-profile git repo with auto-commit on activate/deactivate transitions.
4. **Settings merge**: Field-level merge when importing plugins/hooks/mcp, not file-level overwrite.
5. **Safety-first lifecycle**: init backs up, pause/uninstall fully restores, delete has guards.
6. **Status bar composition**: Prepend/append badge to existing statusLine, never override.

## Concurrency and Parallel Instances

When `ccp launch <name>` is used alongside a regular `claude` session (via symlink), each instance operates on a separate profile directory. There is no shared mutable state between profiles — each has its own `history.jsonl`, `settings.json`, `projects/`, etc. Concurrent writes to the same profile are not expected (each instance uses a different `CLAUDE_CONFIG_DIR`).

If a user runs `ccp launch <name>` for the same profile that is currently active via symlink, both instances would write to the same directory. `ccp launch` will detect this and warn: "Profile '<name>' is already active via symlink. Use `claude` directly or launch a different profile."

## Installation and Distribution

- **Primary**: `npm install -g claude-code-profile` (provides `ccp` binary)
- **`.ccp.json` version field**: Used for future config migration. When ccp upgrades and detects an older version, it runs automatic migration (e.g., adding new fields to `.profile.json`). Migrations are non-destructive and auto-snapshot before running.
