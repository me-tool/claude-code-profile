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
  return select({ message, choices: profiles.map(p => ({ name: p, value: p })) });
}

export async function selectImportItems(): Promise<string[]> {
  return checkbox({
    message: 'Select items to import:',
    choices: IMPORT_ITEMS.map(item => ({
      ...item,
      checked: ['plugins', 'skills'].includes(item.value),
    })),
  });
}

export async function confirmAction(message: string): Promise<boolean> {
  return confirm({ message, default: false });
}

export async function inputText(message: string, defaultValue?: string): Promise<string> {
  return input({ message, default: defaultValue });
}
