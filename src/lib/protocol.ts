/**
 * Version of the harness shape (docs/design-v1.md §3) that this build reads
 * and writes. Independent of a harness's own `version` and of the tool's
 * package version. A harness.json or lock without `protocol` is 1.0 — the
 * shape v1.0.0 of the tool shipped, before the field existed.
 *
 * The tool reads exactly one protocol. A harness must be on it; a project
 * behind it is brought forward by `agentic migrate` (lib/migrate.ts).
 */
export const CURRENT_PROTOCOL = "1.1";
export const DEFAULT_PROTOCOL = "1.0";

/** Numeric compare of "major.minor" strings: negative, zero, or positive. */
export function compareProtocol(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
