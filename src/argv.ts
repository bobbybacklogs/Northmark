const COMMANDS = new Set(['generate', 'crawl', 'help']);
const TAKES_VALUE = new Set([
  '--docs',
  '-d',
  '--cwd',
  '--base-url',
  '--api-key',
  '--model',
  '--timeout',
  '--max-bytes',
  '--out',
]);
const META = new Set(['-h', '--help', '-V', '--version']);

export function shouldUseInteractive(argv: string[], tty: boolean, env: NodeJS.ProcessEnv): boolean {
  if (!tty) return false;
  if (env.CI || env.NORTHMARK_NO_INTERACTIVE) return false;
  return argv.slice(2).length === 0;
}

/**
 * Flags without a subcommand run `generate`, so `northmark --dry-run` works in scripts.
 * Help and version stay on the root command.
 */
export function normalizeArgv(argv: string[]): string[] {
  const args = argv.slice(2);
  if (args.length === 0) return argv;
  if (hasCommand(args)) return argv;
  if (args.every((arg) => META.has(arg))) return argv;
  if (firstPositional(args)) return argv;
  return [argv[0] ?? 'northmark', argv[1] ?? 'northmark', 'generate', ...args];
}

function hasCommand(args: string[]): boolean {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === '--') break;
    if (COMMANDS.has(arg)) return true;
    if (arg.startsWith('--') && arg.includes('=')) continue;
    if (TAKES_VALUE.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) continue;
    break;
  }
  return false;
}

function firstPositional(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === '--') break;
    if (arg.startsWith('--') && arg.includes('=')) continue;
    if (TAKES_VALUE.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) continue;
    return arg;
  }
  return undefined;
}
