/** Limits from docs/PRD.md — enforced before any processing starts. */

export const LIMITS = {
  merge: { maxMb: 100, maxFiles: 25 },
} as const;

export interface LimitCheck {
  ok: boolean;
  error?: string;
}

/** Total-size + count guard. Returns a named error, never throws. */
export function checkMergeLimits(
  files: { size: number }[],
  fmtTooBig: (limit: number) => string,
  fmtTooMany: (n: number) => string,
): LimitCheck {
  if (files.length > LIMITS.merge.maxFiles) {
    return { ok: false, error: fmtTooMany(LIMITS.merge.maxFiles) };
  }
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > LIMITS.merge.maxMb * 1024 * 1024) {
    return { ok: false, error: fmtTooBig(LIMITS.merge.maxMb) };
  }
  return { ok: true };
}

/** Rough peak-memory estimate for merge: ~2.5x total input (parsed docs + output). */
export function estimateMergePeakMb(totalInputMb: number): number {
  return Math.ceil(totalInputMb * 2.5);
}
