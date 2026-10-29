import { Command } from 'commander';
import { DEFAULT_BASE_URL, DEFAULT_MAX_BYTES, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS } from './config.js';
import { executeCrawl, executeGenerate, type GenerateFlags } from './run.js';
import { renderBanner, type Io } from './ui.js';
import { VERSION } from './version.js';

export function buildProgram(io: Io): Command {
  const program = new Command();
  program
    .name('northmark')
    .description('Give every product a clear direction.')
    .version(VERSION, '-V, --version', 'print the version')
    .helpCommand('help [command]', 'show help for a command')
    .showHelpAfterError('\nSee `northmark --help` for usage.')
    .configureOutput({
      writeOut(str) {
        io.stdout.write(str);
      },
      writeErr(str) {
        io.stderr.write(str);
      },
    })
    .exitOverride();

  program.addHelpText('beforeAll', () => renderBanner());
  program.addHelpText('after', () => helpExamples());

  const generate = program
    .command('generate')
    .description('Draft product-alignment docs from the current project');
  addGenerateOptions(generate);
  generate.action(async () => {
    await executeGenerate(generate.opts<GenerateFlags>(), io);
  });

  const crawl = program
    .command('crawl')
    .description('Show what Northmark would read. No model call, nothing written');
  crawl
    .option('--cwd <dir>', 'project directory (default: the current directory)')
    .option('--max-bytes <n>', `context budget in bytes (default: ${DEFAULT_MAX_BYTES})`);
  crawl.action(async () => {
    await executeCrawl(crawl.opts<GenerateFlags>(), io);
  });

  return program;
}

function addGenerateOptions(command: Command): void {
  command
    .option('-d, --docs <list>', 'comma-separated docs: readme, product-brief, design, architecture (default: all)')
    .option('-n, --dry-run', 'show the crawl and the files that would be written; do not call the model')
    .option('-f, --force', 'overwrite docs that already exist')
    .option('--out <dir>', 'output directory inside the project (default: docs)')
    .option('--cwd <dir>', 'project directory (default: the current directory)')
    .option('--base-url <url>', `model API base URL (default: ${DEFAULT_BASE_URL})`)
    .option('--api-key <key>', 'API key (prefer NORTHMARK_API_KEY; the default key works with ModelHitch)')
    .option('--model <id>', `model id (default: ${DEFAULT_MODEL})`)
    .option('--timeout <ms>', `request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`)
    .option('--max-bytes <n>', `context budget in bytes (default: ${DEFAULT_MAX_BYTES})`);
}

function helpExamples(): string {
  return `
Examples:
  $ northmark                                  interactive menu on a TTY
  $ northmark generate                         draft every alignment doc
  $ northmark generate --dry-run               crawl and plan, no model call
  $ northmark --dry-run                        same as generate --dry-run
  $ northmark generate --docs readme,product-brief --force
  $ northmark crawl                            show what would be read
  $ northmark help generate

Docs written to docs/ (the project README is left alone):
  README.md             product overview
  product_brief.md      problem, audience, principles
  design_direction.md   UI, tokens, and visual language from the source
  architecture.md       how the system is shaped

Environment:
  NORTHMARK_BASE_URL     model API base (default ${DEFAULT_BASE_URL})
  NORTHMARK_API_KEY      API key (default MHK-123)
  NORTHMARK_MODEL        model id (default ${DEFAULT_MODEL})
  NORTHMARK_TIMEOUT_MS   request timeout in milliseconds
  NORTHMARK_MAX_BYTES    context budget in bytes

ModelHitch accepts any API key string. Point the base URL at another
OpenAI-compatible server to bring your own key.
`;
}
