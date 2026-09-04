/**
 * Version of the harness shape (docs/design-v1.md §3) that this build reads
 * and writes. Semver, and independent of both a harness's own `version` and
 * this package's version. A harness.json or lock without `protocol` is
 * 1.0.0 — the shape that shipped before the field existed.
 *
 * MAJOR is a shape change: a harness must be rewritten, a project must be
 * migrated. MINOR is additive, such as a new optional directory or field: a
 * harness written for an older MINOR still works. PATCH never changes the
 * contract and is ignored when deciding compatibility.
 */
export const CURRENT_PROTOCOL = "2.0.0";
export const DEFAULT_PROTOCOL = "1.0.0";

/** [major, minor, patch]; missing components are 0, so "1.0" parses as 1.0.0. */
export function parseProtocol(v: string): [number, number, number] {
  const p = v.split(".").map((n) => Number(n) || 0);
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
}

export function majorOf(v: string): number {
  return parseProtocol(v)[0];
}

/** Numeric compare of two protocol strings: negative, zero, or positive. */
export function compareProtocol(a: string, b: string): number {
  const pa = parseProtocol(a);
  const pb = parseProtocol(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * Whether a harness written for `harness` is readable by a tool on `tool`.
 * Same MAJOR, and no newer MINOR than the tool knows. PATCH is ignored.
 */
export function isCompatibleProtocol(harness: string, tool: string): boolean {
  const [hMaj, hMin] = parseProtocol(harness);
  const [tMaj, tMin] = parseProtocol(tool);
  return hMaj === tMaj && hMin <= tMin;
}
