import { runActivate } from './activate';
import { CLAUDE_DIR, PROFILES_DIR } from '../core/paths';

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
