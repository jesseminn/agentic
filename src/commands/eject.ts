import * as fs from "node:fs";
import * as path from "node:path";
import { requireAgenticDir, getAgenticDir, AGENTIC_DIR, PLATFORMS } from "../lib/platforms.js";
import { flattenSymlink, isLinkInto } from "../lib/symlink.js";
import { removeAllAgenticEntries } from "../lib/gitignore.js";
import { readLock } from "../lib/lock.js";
import { isGenerated } from "../lib/generated.js";
import { renderRoot } from "../lib/linker.js";

/**
 * Flatten every linked platform to standalone files and remove .agentic/.
 * The generated root file becomes real content (imports inlined); every
 * symlink into .agentic/ becomes a copy; translated files lose their header.
 */
export function ejectCommand(cwd: string): void {
  requireAgenticDir(cwd);
  const agenticDir = getAgenticDir(cwd);
  const platforms = readLock(cwd)?.platforms ?? [];

  if (platforms.length === 0) {
    console.log("No platforms linked. Removing .agentic/ only.");
  }

  for (const platform of platforms) {
    const m = PLATFORMS[platform];

    const root = path.join(cwd, m.rulesRoot);
    if (isGenerated(root) || isLinkInto(root, agenticDir)) {
      const body = renderRoot(cwd, platform, "concat");
      if (isLinkInto(root, agenticDir)) fs.unlinkSync(root);
      fs.writeFileSync(root, body);
    }

    for (const rel of [m.legacyRulesDir, m.skillsDir, m.agentsDir]) {
      if (!rel) continue;
      const dir = path.join(cwd, rel);
      if (isLinkInto(dir, agenticDir)) {
        flattenSymlink(dir);
        continue;
      }
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const inner = path.join(p, "agent.md");
        if (isLinkInto(p, agenticDir)) flattenSymlink(p);
        else if (isGenerated(p)) stripHeader(p);
        else if (isLinkInto(inner, agenticDir)) flattenSymlink(inner);
      }
    }

    const mcp = path.join(cwd, m.mcp.target);
    if (isLinkInto(mcp, agenticDir)) flattenSymlink(mcp);
    else if (isGenerated(mcp)) stripHeader(mcp);

    console.log(`  Ejected ${platform}`);
  }

  removeAllAgenticEntries(cwd);
  fs.rmSync(agenticDir, { recursive: true, force: true });
  console.log(`\nRemoved ${AGENTIC_DIR}/. Platform configs are now standalone files.`);
}

function stripHeader(p: string): void {
  const lines = fs.readFileSync(p, "utf-8").split("\n");
  lines.shift();
  fs.writeFileSync(p, lines.join("\n"));
}
