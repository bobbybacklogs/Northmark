import { cancel, confirm, intro, isCancel, multiselect, outro } from '@clack/prompts';
import pc from 'picocolors';
import { DOC_SPECS } from './docs.js';
import { NorthmarkError } from './errors.js';
import { executeGenerate } from './run.js';
import type { DocId } from './types.js';
import { brand, type Io } from './ui.js';

export async function runInteractive(io: Io): Promise<void> {
  intro(`${brand('Northmark')} ${pc.dim('— give every product a clear direction')}`);

  const selected = await multiselect<DocId>({
    message: 'Which docs should we draft?',
    options: DOC_SPECS.map((spec) => ({ value: spec.id, label: spec.filename, hint: spec.hint })),
    initialValues: DOC_SPECS.map((spec) => spec.id),
    required: true,
  });
  if (isCancel(selected)) {
    cancel('Stopped before reading the project.');
    return;
  }
  if (selected.length === 0) {
    throw new NorthmarkError('Choose at least one doc to generate.');
  }

  const dry = await confirm({
    message: 'Dry run only? Nothing is sent to the model and nothing is written.',
    initialValue: false,
  });
  if (isCancel(dry)) {
    cancel('Stopped before reading the project.');
    return;
  }

  const status = await executeGenerate(
    {
      cwd: io.cwd,
      dryRun: dry === true,
      out: 'docs',
    },
    io,
    {
      banner: false,
      docs: selected,
      confirmOverwrite: async (files) => {
        const answer = await confirm({
          message: `Overwrite ${files.join(', ')}?`,
          initialValue: false,
        });
        if (isCancel(answer)) return false;
        return answer === true;
      },
    },
  );

  if (status === 'cancelled') {
    outro('Left existing docs untouched.');
    return;
  }
  outro(status === 'dry-run'
    ? 'Dry run only. Nothing was written.'
    : 'Direction is on paper. Edit the docs and make them yours.');
}
