# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/HaloXie/claude-code-profile/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/HaloXie/claude-code-profile/releases/tag/v0.1.0
