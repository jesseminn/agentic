import { requireAgenticDir, type PlatformId } from "../lib/platforms.js";
import { linkPlatform, unlinkPlatform, type LinkReport } from "../lib/linker.js";
import { requireCompatibleProtocol } from "../lib/migrate.js";

export function linkCommand(cwd: string, platform: PlatformId): void {
  requireAgenticDir(cwd);
  requireCompatibleProtocol(cwd);
  const report = linkPlatform(cwd, platform);
  printLinkReport(report);
  if (report.conflicts.length > 0) process.exit(1);
}

export function unlinkCommand(cwd: string, platform: PlatformId): void {
  requireAgenticDir(cwd);
  requireCompatibleProtocol(cwd);
  const report = unlinkPlatform(cwd, platform);
  console.log(`Unlinked ${platform}`);
  for (const r of report.removed) console.log(`  removed ${r}`);
  if (report.kept.length) {
    console.log(`  kept (not created by agentic):`);
    for (const k of report.kept) console.log(`    ${k}`);
  }
}

export function printLinkReport(r: LinkReport, verb = "Linked"): void {
  const changes = r.added.length + r.removed.length + r.updated.length;
  console.log(
    `\n${verb} ${r.platform}: ${changes === 0 ? "up to date" : `${changes} change${changes === 1 ? "" : "s"}`}${r.unchanged ? ` (${r.unchanged} unchanged)` : ""}`
  );
  for (const a of r.added) console.log(`  + ${a}`);
  for (const u of r.updated) console.log(`  ~ ${u}`);
  for (const d of r.removed) console.log(`  - ${d}`);
  if (r.conflicts.length) {
    console.log(`  ${r.conflicts.length} conflict${r.conflicts.length === 1 ? "" : "s"} (not touched):`);
    for (const c of r.conflicts) console.log(`    ! ${c}`);
  }
}
