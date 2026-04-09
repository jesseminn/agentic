import * as fs from "node:fs";
import * as path from "node:path";
import { AGENTIC_DIR, getAgenticDir } from "../lib/platforms.js";
import { copyTemplate } from "../lib/templates.js";

export function initCommand(cwd: string): void {
  const dir = getAgenticDir(cwd);

  if (fs.existsSync(dir)) {
    console.error(`Error: ${AGENTIC_DIR}/ already exists.`);
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });

  // AGENTIC.md — bundled template (updated via `agentic update`)
  copyTemplate("AGENTIC.md", path.join(dir, "AGENTIC.md"));

  // RULES.md — references AGENTIC.md, user owns this file
  fs.writeFileSync(
    path.join(dir, "RULES.md"),
    "See [AGENTIC.md](AGENTIC.md) for workspace setup.\n"
  );

  // .mcp.json — empty config
  fs.writeFileSync(
    path.join(dir, ".mcp.json"),
    JSON.stringify({ mcpServers: {} }, null, 2) + "\n"
  );

  // skills/ — empty dir
  fs.mkdirSync(path.join(dir, "skills"));

  // agents/ — empty dir
  fs.mkdirSync(path.join(dir, "agents"));

  // .gitignore
  fs.writeFileSync(path.join(dir, ".gitignore"), "temp/\nnode_modules/\n");

  console.log(`Created ${AGENTIC_DIR}/ with AGENTIC.md, RULES.md, .mcp.json, skills/, agents/`);
}
