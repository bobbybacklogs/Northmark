import { describe, expect, it } from 'vitest';
import { detectSignals } from '../src/signals.js';

describe('detectSignals', () => {
  it('reads frameworks, colors, fonts, and tokens from source', () => {
    const signals = detectSignals([
      {
        path: 'package.json',
        text: JSON.stringify({
          dependencies: { react: '18.3.1', tailwindcss: '3.4.0', '@radix-ui/react-slot': '1.0.0' },
        }),
      },
      {
        path: 'src/app.css',
        text: ':root { --color-accent: #7c3aed; font-family: "Source Serif 4", Georgia, serif; }\n',
      },
      { path: 'src/components/Button.tsx', text: 'export const Button = () => null;\n' },
      { path: 'src/app.ts', text: 'const issue = "#123"; const color = "#112233";\n' },
    ]);

    expect(signals.frameworks).toEqual(expect.arrayContaining(['React', 'Tailwind CSS', 'Radix UI']));
    expect(signals.colors).toContain('#7c3aed');
    expect(signals.colors).toContain('#112233');
    expect(signals.colors).not.toContain('#123');
    expect(signals.fonts).toContain('Source Serif 4');
    expect(signals.fonts).not.toContain('Georgia');
    expect(signals.cssVariables).toContain('--color-accent');
    expect(signals.uiPaths).toContain('src/components/Button.tsx');
  });

  it('ignores generic font keywords', () => {
    const signals = detectSignals([
      { path: 'src/app.css', text: 'body { font-family: inherit; color: #fff; }\n' },
    ]);
    expect(signals.fonts).toEqual([]);
    expect(signals.colors).toContain('#fff');
  });
});
