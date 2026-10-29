import { CommanderError } from 'commander';
import { normalizeArgv, shouldUseInteractive } from './argv.js';
import { NorthmarkError } from './errors.js';
import { runInteractive } from './interactive.js';
import { buildProgram } from './program.js';
import { defaultIo, writeError, type Io } from './ui.js';

export async function main(argv: string[], io: Io = defaultIo()): Promise<number> {
  try {
    if (shouldUseInteractive(argv, io.tty, io.env)) {
      await runInteractive(io);
      return 0;
    }
    const program = buildProgram(io);
    const normalized = normalizeArgv(argv);
    if (normalized.length <= 2) {
      program.outputHelp();
      return 0;
    }
    await program.parseAsync(normalized);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    writeError(io, error);
    return error instanceof NorthmarkError ? error.exitCode : 1;
  }
}
