# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Plugin shared store**: pnpm-style centralized storage for plugins across profiles. Plugins are stored once in `$CCP_STORE` (default `~/.claude-profiles/.store`) and shared via symlinks, eliminating redundant copies.
- **Environment variables**: `CCP_HOME` and `CCP_STORE` environment variables, automatically injected into shell rc during `ccp init`. `CCP_STORE` is independently configurable for custom store locations.
- **`ccp gc` command**: Clean up orphaned plugins from the shared store — plugins no longer referenced by any profile.
- **Lazy migration**: Plugins installed by Claude Code are automatically detected and migrated to the shared store during `activate`, `snapshot`, `pause`, and `resume` operations.
- **Store health checks in `ccp doctor`**: Detects dangling symlinks, unmigrated plugins, orphaned store entries, and missing environment variables.

### Changed

- **`ccp init`**: Now creates the shared plugin store and migrates existing plugins during initialization.
- **`ccp create --from` / `ccp copy`**: Cloned profiles share plugins via store symlinks instead of full copies.
- **`ccp pause` / `ccp uninstall`**: Automatically dereferences plugin symlinks when restoring `~/.claude` as a real directory.
- **`ccp resume`**: Re-migrates plugins to the shared store after syncing changes from the pause period.
- **`ccp export`**: Exports self-contained archives with dereferenced plugin files (no broken symlinks).
- **`ccp import`**: Re-migrates imported plugins to the shared store.
- **Config version**: `.ccp.json` version bumped to `2` with new `store` field.

## [0.2.1] - 2026-03-17

### Added

- **CI workflow**: GitHub Actions CI for PR and push-to-main validation (test + build).
- **CI/CD release workflow**: GitHub Actions workflow for automated npm publishing and GitHub Release on `v*` tag push, with npm provenance signing.

### Fixed

- **CI test failure**: Added local git `user.name` and `user.email` config in `initGit()` so profile commits work in clean CI environments (GitHub Actions runners lack global git config).

## [0.2.0] - 2026-03-17

### Added

- **Profile isolation via `claudeMdExcludes`**: Non-default profiles now automatically configure `claudeMdExcludes` in `settings.json` to prevent Claude Code's parent directory traversal from leaking the default profile's `CLAUDE.md` and rules. This enables true concurrent multi-profile usage.
- **Auto status bar integration**: New profiles automatically include `statusLine` configuration showing the active profile badge.
- **Command aliases**: `ccp run` → `launch`, `ccp add` → `create`, `ccp remove` → `delete`.
- **Version flag alias**: `ccp -v` now works in addition to `ccp -V` and `ccp --version`.

### Changed

- **Backup location**: `ccp init` now stores the original `~/.claude` backup inside `~/.claude-profiles/.backup-{timestamp}` instead of `~/.claude-backup-{timestamp}`, keeping all ccp-related files cohesive.
- **Launch command**: Removed unnecessary active profile check — `ccp launch` now always uses `CLAUDE_CONFIG_DIR` regardless of which profile is currently active.

### Fixed

- **Profile leaking**: Fixed issue where `ccp launch <profile>` would still load the default profile's `CLAUDE.md` content. Root cause: Claude Code traverses parent directories and discovers `~/.claude/CLAUDE.md` as a project-level file, bypassing `CLAUDE_CONFIG_DIR`. Solved by auto-configuring `claudeMdExcludes` on profile creation.

## [0.1.0] - 2026-03-17

### Added

- Initial release
- Profile lifecycle: `init`, `pause`, `resume`, `uninstall`
- Profile CRUD: `create`, `delete`, `list`, `info`, `rename`, `copy`
- Activation: `activate`, `deactivate`, `launch`, `current`
- Selective import/export between profiles
- Version control: `snapshot`, `history`, `rollback`
- Health check: `doctor`
- Status bar integration via `ccp current --badge`
- Atomic symlink switching
- Concurrent lock with stale PID detection

[Unreleased]: https://github.com/me-tool/claude-code-profile/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/me-tool/claude-code-profile/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/me-tool/claude-code-profile/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/me-tool/claude-code-profile/releases/tag/v0.1.0
