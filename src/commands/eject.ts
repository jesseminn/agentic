import * as fs from "node:fs";
import * as path from "node:path";
import {
  requireAgenticDir,
  getAgenticDir,
  getInstalledPlatforms,
  AGENTIC_DIR,
} from "../lib/platforms.js";
import { flattenSymlink } from "../lib/symlink.js";
import { removeAllAgenticEntries } from "../lib/gitignore.js";
import { PLATFORMS } from "../lib/platforms.js";
import { removeBundledSkills, stripManagedBlock } from "../lib/templates.js";

export function ejectCommand(cwd: string): void {
  requireAgenticDir(cwd);

  const installed = getInstalledPlatforms(cwd);

  if (installed.length === 0) {
    console.log("No platforms installed. Nothing to eject.");
  }

  // Strip agentic-managed content from .agentic/ before flattening so the
  // resulting standalone files don't carry it forward.
  const agenticDir = getAgenticDir(cwd);
  stripManagedBlock(path.join(agenticDir, "RULES.md"));
  const removed = removeBundledSkills(path.join(agenticDir, "skills"));
  if (removed.length > 0) {
    console.log(`  Removed bundled skills: ${removed.join(", ")}`);
  }

  // Flatten symlinks for each installed platform
  for (const platform of installed) {
    const mapping = PLATFORMS[platform];

    // Rules
    flattenSymlink(path.join(cwd, mapping.rules.target));

    // Skills
    flattenSymlink(path.join(cwd, mapping.skills.target));

    // MCP — only flatten if symlinked
    if (mapping.mcp.type === "symlink") {
      flattenSymlink(path.join(cwd, mapping.mcp.target));
    }
    // merge/translate targets are already real files

    // Agents — only flatten if symlinked
    if (mapping.agents.type === "symlink") {
      flattenSymlink(path.join(cwd, mapping.agents.target));
    }
    // translate targets are already real files

    console.log(`  Ejected ${platform}`);
  }

  // Remove all agentic entries from .gitignore
  removeAllAgenticEntries(cwd);

  // Delete .agentic/
  fs.rmSync(agenticDir, { recursive: true, force: true });
  console.log(`\nRemoved ${AGENTIC_DIR}/. Platform configs are now standalone files.`);
}
