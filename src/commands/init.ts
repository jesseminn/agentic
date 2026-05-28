import * as fs from "node:fs";
import * as path from "node:path";
import { AGENTIC_DIR, getAgenticDir } from "../lib/platforms.js";
import { copyBundledSkills, writeRulesFromTemplate } from "../lib/templates.js";

export function initCommand(cwd: string): void {
  const dir = getAgenticDir(cwd);

  if (fs.existsSync(dir)) {
    console.error(`Error: ${AGENTIC_DIR}/ already exists.`);
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });

  writeRulesFromTemplate(path.join(dir, "RULES.md"));

  fs.writeFileSync(
    path.join(dir, ".mcp.json"),
    JSON.stringify({ mcpServers: {} }, null, 2) + "\n"
  );

  fs.mkdirSync(path.join(dir, "agents"));

  const bundled = copyBundledSkills(path.join(dir, "skills"));

  fs.writeFileSync(path.join(dir, ".gitignore"), "temp/\nnode_modules/\n");

  const skillsSummary =
    bundled.length > 0 ? ` (bundled: ${bundled.join(", ")})` : "";
  console.log(
    `Created ${AGENTIC_DIR}/ with RULES.md, .mcp.json, skills/${skillsSummary}, agents/`
  );
}
