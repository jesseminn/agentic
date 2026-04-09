import * as path from "node:path";
import { requireAgenticDir, getAgenticDir } from "../lib/platforms.js";
import { copyTemplate } from "../lib/templates.js";

export function updateCommand(cwd: string): void {
  requireAgenticDir(cwd);

  const agenticDir = getAgenticDir(cwd);

  copyTemplate("AGENTIC.md", path.join(agenticDir, "AGENTIC.md"));
  console.log("  Updated .agentic/AGENTIC.md");

  console.log("\nDone.");
}
