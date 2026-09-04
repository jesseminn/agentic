import { AGENTIC_DIR, requireAgenticDir } from "../lib/platforms.js";
import { CURRENT_PROTOCOL } from "../lib/protocol.js";
import { migrateProject, type MigrateResult } from "../lib/migrate.js";
import { printLinkReport } from "./link.js";

/** Bring .agentic/ up to this build's protocol. */
export function migrateCommand(cwd: string): void {
  requireAgenticDir(cwd);
  if (!run(cwd)) console.log(`Already on protocol ${CURRENT_PROTOCOL}.`);
}

/** For `install` and `update`: migrate first if anything is pending, and say so. */
export function autoMigrate(cwd: string): void {
  run(cwd);
}

function run(cwd: string): MigrateResult | null {
  let r: MigrateResult | null;
  try {
    r = migrateProject(cwd);
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }
  if (!r) return null;
  if (r.lines.length === 0) {
    console.log(`Stamped ${AGENTIC_DIR}/ protocol ${r.from} to ${r.to} — no shape change between them.`);
  } else {
    console.log(`Migrated ${AGENTIC_DIR}/ from protocol ${r.from} to ${r.to}:`);
    for (const l of r.lines) console.log(`  ${l}`);
  }
  for (const report of r.links) printLinkReport(report);
  return r;
}
