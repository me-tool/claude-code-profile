#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from '../src/commands/init';
import { runPause } from '../src/commands/pause';
import { runResume } from '../src/commands/resume';
import { runUninstall } from '../src/commands/uninstall';
import { runCreate } from '../src/commands/create';
import { runDelete } from '../src/commands/delete';
import { runList } from '../src/commands/list';
import { runInfo } from '../src/commands/info';
import { runRename } from '../src/commands/rename';
import { runCopy } from '../src/commands/copy';
import { runActivate } from '../src/commands/activate';
import { runDeactivate } from '../src/commands/deactivate';
import { runLaunch } from '../src/commands/launch';
import { runCurrent } from '../src/commands/current';
import { runImport } from '../src/commands/import';
import { runExport } from '../src/commands/export';
import { runImportArchive } from '../src/commands/import-archive';
import { runSnapshot } from '../src/commands/snapshot';
import { runHistory } from '../src/commands/history';
import { runRollback } from '../src/commands/rollback';
import { runDoctor } from '../src/commands/doctor';
import { runGc } from '../src/commands/gc';
import { getErrorMessage } from '../src/utils/logger';
import pkg from '../package.json';

const program = new Command();

program
  .name('ccp')
  .description('Claude Code Profile -- Chrome-like profile management for Claude Code')
  .version(pkg.version, '-v, --version');

// --- Lifecycle ---

program
  .command('init')
  .description('Initialize ccp, migrate ~/.claude to profile management')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (opts) => {
    try {
      await runInit({ skipConfirm: opts.yes });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('pause')
  .description('Suspend ccp, restore ~/.claude as real directory')
  .option('-y, --yes', 'Skip confirmation')
  .option('-f, --force', 'Force even if Claude is running')
  .action(async (opts) => {
    try {
      await runPause({ skipConfirm: opts.yes, force: opts.force });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('resume')
  .description('Resume ccp after pause')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (opts) => {
    try {
      await runResume({ skipConfirm: opts.yes });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('uninstall')
  .description('Uninstall ccp, restore ~/.claude as real directory')
  .option('-y, --yes', 'Skip confirmation')
  .option('-f, --force', 'Force even if Claude is running')
  .action(async (opts) => {
    try {
      await runUninstall({ skipConfirm: opts.yes, force: opts.force });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

// --- Profile Management ---

program
  .command('create')
  .alias('add')
  .description('Create a new profile')
  .argument('<name>', 'Profile name')
  .option('--from <profile>', 'Clone from existing profile')
  .option('--description <desc>', 'Profile description')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (name, opts) => {
    try {
      await runCreate({ name, from: opts.from, description: opts.description, skipPrompts: opts.yes });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('delete')
  .alias('remove')
  .description('Delete a profile')
  .argument('<name>', 'Profile name')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (name, opts) => {
    try {
      await runDelete({ name, skipConfirm: opts.yes });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all profiles')
  .action(async () => {
    try {
      await runList();
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Show profile details')
  .argument('<name>', 'Profile name')
  .action(async (name) => {
    try {
      await runInfo({ name });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('rename')
  .description('Rename a profile')
  .argument('<old>', 'Current profile name')
  .argument('<new>', 'New profile name')
  .action(async (oldName, newName) => {
    try {
      await runRename({ oldName, newName });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('copy')
  .description('Copy a profile')
  .argument('<src>', 'Source profile name')
  .argument('<dst>', 'Destination profile name')
  .action(async (src, dst) => {
    try {
      await runCopy({ sourceName: src, targetName: dst });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

// --- Activation ---

program
  .command('activate')
  .description('Switch active profile')
  .argument('<name>', 'Profile name')
  .option('--force', 'Force switch even if Claude is running')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (name, opts) => {
    try {
      await runActivate({ name, force: opts.force, skipConfirm: opts.yes });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('deactivate')
  .description('Switch back to default profile')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (opts) => {
    try {
      await runDeactivate({ skipConfirm: opts.yes });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('launch')
  .alias('run')
  .description('Launch Claude with a specific profile (without switching)')
  .argument('<name>', 'Profile name')
  .action(async (name) => {
    try {
      await runLaunch({ name });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('current')
  .description('Show current active profile')
  .option('--badge', 'Output as badge format [name]')
  .action(async (opts) => {
    try {
      const name = await runCurrent({ badge: opts.badge });
      if (!opts.badge) console.log(name);
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

// --- Import / Export ---

program
  .command('import')
  .description('Import items from another profile')
  .argument('<target>', 'Target profile name')
  .requiredOption('--from <profile>', 'Source profile name')
  .option('--items <items...>', 'Items to import (auth, plugins, skills, hooks, mcp, rules, settings, memory, conversations)')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (target, opts) => {
    try {
      await runImport({ target, from: opts.from, items: opts.items, skipPrompts: opts.yes });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Export a profile to archive')
  .argument('<name>', 'Profile name')
  .requiredOption('-o, --output <path>', 'Output path')
  .option('--include-auth', 'Include auth credentials')
  .option('--include-history', 'Include conversation history')
  .action(async (name, opts) => {
    try {
      await runExport({ name, output: opts.output, includeAuth: opts.includeAuth, includeHistory: opts.includeHistory });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('import-archive')
  .description('Import a profile from archive')
  .argument('<path>', 'Archive file path')
  .option('--name <name>', 'Override profile name')
  .action(async (archivePath, opts) => {
    try {
      await runImportArchive({ archivePath, name: opts.name });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

// --- Version Control ---

program
  .command('snapshot')
  .description('Create a manual snapshot of a profile')
  .argument('<name>', 'Profile name')
  .option('-m, --message <msg>', 'Snapshot message')
  .action(async (name, opts) => {
    try {
      await runSnapshot({ name, message: opts.message });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('history')
  .description('Show snapshot history for a profile')
  .argument('<name>', 'Profile name')
  .option('-n, --count <number>', 'Number of entries to show', '20')
  .action(async (name, opts) => {
    try {
      await runHistory({ name, count: parseInt(opts.count, 10) });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

program
  .command('rollback')
  .description('Rollback a profile to a previous snapshot')
  .argument('<name>', 'Profile name')
  .option('--commit <hash>', 'Commit hash to rollback to')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (name, opts) => {
    try {
      await runRollback({ name, commit: opts.commit, skipPrompts: opts.yes });
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

// --- Health ---

program
  .command('doctor')
  .description('Check ccp health and diagnose issues')
  .action(async () => {
    try {
      await runDoctor();
    } catch (err: unknown) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
  });

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

// --- Completion ---

program
  .command('completion')
  .description('Output shell completion script')
  .argument('[shell]', 'Shell type (bash, zsh, fish)', 'zsh')
  .action((shell: string) => {
    const commands = program.commands.map(c => c.name()).filter(n => n !== 'completion');
    const aliases = program.commands.flatMap(c => c.aliases());

    if (shell === 'zsh') {
      console.log(`#compdef ccp
# Add to ~/.zshrc: eval "$(ccp completion zsh)"
_ccp() {
  local -a commands
  commands=(
${commands.map(c => `    '${c}:${program.commands.find(cmd => cmd.name() === c)?.description() || ''}'`).join('\n')}
  )
  _describe 'ccp commands' commands
}
compdef _ccp ccp`);
    } else if (shell === 'bash') {
      console.log(`# Add to ~/.bashrc: eval "$(ccp completion bash)"
_ccp_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local commands="${[...commands, ...aliases].join(' ')}"
  COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
}
complete -F _ccp_completions ccp`);
    } else if (shell === 'fish') {
      console.log(`# Add to ~/.config/fish/completions/ccp.fish: ccp completion fish | source`);
      for (const cmd of program.commands) {
        if (cmd.name() === 'completion') continue;
        const desc = cmd.description() || '';
        console.log(`complete -c ccp -f -n '__fish_use_subcommand' -a '${cmd.name()}' -d '${desc}'`);
        for (const alias of cmd.aliases()) {
          console.log(`complete -c ccp -f -n '__fish_use_subcommand' -a '${alias}' -d '${desc}'`);
        }
      }
    } else {
      console.error(`Unsupported shell: ${shell}. Use bash, zsh, or fish.`);
      process.exit(1);
    }
  });

program.parse();
