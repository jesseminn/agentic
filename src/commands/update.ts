import * as path from "node:path";
import { requireAgenticDir, getAgenticDir } from "../lib/platforms.js";
import { copyBundledSkills, updateManagedBlock } from "../lib/templates.js";

export function updateCommand(cwd: string): void {
  requireAgenticDir(cwd);

  const agenticDir = getAgenticDir(cwd);
  const rulesPath = path.join(agenticDir, "RULES.md");

  const result = updateManagedBlock(rulesPath);
  switch (result) {
    case "updated":
      console.log("  Refreshed managed block in .agentic/RULES.md");
      break;
    case "no-file":
      console.log(
        "  .agentic/RULES.md not found — skipped (re-run `agentic init` to recreate)"
      );
      break;
    case "no-markers":
      console.log(
        "  .agentic/RULES.md missing agentic:begin/end markers — skipped (restore the markers or delete RULES.md and re-run init)"
      );
      break;
  }

  const bundled = copyBundledSkills(path.join(agenticDir, "skills"));
  if (bundled.length > 0) {
    console.log(`  Refreshed bundled skills: ${bundled.join(", ")}`);
  }

  console.log("\nDone.");
}
