import path from 'node:path';

/** True when `candidate` is `root` or a path inside it. Does not follow symlinks. */
export function isInsideRoot(root: string, candidate: string): boolean {
  const rootResolved = path.resolve(root);
  const cand = path.resolve(candidate);
  if (cand === rootResolved) return true;
  const prefix = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
  return cand.startsWith(prefix);
}

export function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
