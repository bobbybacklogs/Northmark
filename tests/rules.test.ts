import { describe, expect, it } from 'vitest';
import { isInsideRoot } from '../src/paths.js';
import { isJunkDir, isLockfile, isSecretPath } from '../src/rules.js';

describe('isInsideRoot', () => {
  it('accepts the root and its children, and rejects siblings and parents', () => {
    expect(isInsideRoot('/tmp/proj', '/tmp/proj')).toBe(true);
    expect(isInsideRoot('/tmp/proj', '/tmp/proj/src/app.ts')).toBe(true);
    expect(isInsideRoot('/tmp/proj', '/tmp/proj-evil')).toBe(false);
    expect(isInsideRoot('/tmp/proj', '/tmp/proj-evil/src')).toBe(false);
    expect(isInsideRoot('/tmp/proj', '/tmp/other')).toBe(false);
    expect(isInsideRoot('/tmp/proj', '/tmp/proj/../other')).toBe(false);
    expect(isInsideRoot('/tmp/proj', '/tmp')).toBe(false);
  });
});

describe('secret and junk rules', () => {
  it('flags secret-like paths and leaves ordinary source alone', () => {
    const secrets = [
      '.env',
      '.env.local',
      '.env.production',
      'config/.env.production',
      'env.local',
      'id_rsa',
      'id_ed25519.pub',
      'certs/server.pem',
      'private.key',
      'auth.p12',
      'store.keystore',
      'vault.kdbx',
      '.npmrc',
      '.netrc',
      'credentials.json',
      'secrets.yaml',
      'service-account.json',
      'service-account-firebase.json',
      'prod-credentials.json',
      '.ssh/id_rsa',
      '.aws/credentials',
      'secrets/api.txt',
    ];
    for (const rel of secrets) expect(isSecretPath(rel), rel).toBe(true);

    const safe = [
      'environment.ts',
      'env.ts',
      'src/keyboard.ts',
      'design-tokens.json',
      'tokens.css',
      'src/components/SecretButton.tsx',
      'README.md',
      'package.json',
      'src/config.ts',
    ];
    for (const rel of safe) expect(isSecretPath(rel), rel).toBe(false);
  });

  it('knows junk directories and lockfiles', () => {
    expect(isJunkDir('node_modules')).toBe(true);
    expect(isJunkDir('.git')).toBe(true);
    expect(isJunkDir('dist')).toBe(true);
    expect(isJunkDir('src')).toBe(false);
    expect(isLockfile('package-lock.json')).toBe(true);
    expect(isLockfile('pnpm-lock.yaml')).toBe(true);
    expect(isLockfile('Cargo.lock')).toBe(true);
    expect(isLockfile('package.json')).toBe(false);
  });
});
