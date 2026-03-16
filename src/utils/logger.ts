import chalk from 'chalk';

export const log = {
  info: (msg: string) => console.log(chalk.blue('i'), msg),
  success: (msg: string) => console.log(chalk.green('✓'), msg),
  warn: (msg: string) => console.log(chalk.yellow('!'), msg),
  error: (msg: string) => console.error(chalk.red('✗'), msg),
  step: (msg: string) => console.log(chalk.gray('  →'), msg),
  plain: (msg: string) => console.log(msg),
};

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function getErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) return (err as { code: string }).code;
  return undefined;
}
