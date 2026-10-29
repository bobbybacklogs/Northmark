import { execFileSync } from 'node:child_process';

export const KEYCHAIN_SERVICE = 'com.cuvola.northmark.modelhitch';
export const KEYCHAIN_ACCOUNT = 'northmark';

export function readSavedModelKey(): string | undefined {
  if (process.platform !== 'darwin') return undefined;
  try {
    return execFileSync('/usr/bin/security', [
      'find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w',
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim() || undefined;
  } catch {
    return undefined;
  }
}
