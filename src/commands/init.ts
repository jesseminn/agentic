import * as fs from "node:fs";
import * as path from "node:path";
import { AGENTIC_DIR, getAgenticDir } from "../lib/platforms.js";
import { COMMON_RULES, PROJECT_RULES, STANDARD_DIRS } from "../lib/harness.js";
import { emptyLock, writeLock } from "../lib/lock.js";
import { writeMcpJson } from "../lib/translate.js";

export const PROJECT_STUB = `# Project

Project-specific context: goal, structure, stack, conventions that differ
from the harness. Loaded into every session, so keep it short; anything
procedural is a skill.
`;

const COMMON_STUB = `# Common rules

Who the agent is: role, style, conventions shared across projects.

A harness installed with \`agentic install <harness>\` owns this file and
replaces it. Keep project-specific rules in \`rules/PROJECT.md\`.
`;

/** Create a bare .agentic/ with no harness. */
export function initCommand(cwd: string): void {
  const dir = getAgenticDir(cwd);
  if (fs.existsSync(dir)) {
    console.error(`Error: ${AGENTIC_DIR}/ already exists.`);
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });
  for (const sub of STANDARD_DIRS) fs.mkdirSync(path.join(dir, sub));
  fs.writeFileSync(path.join(dir, COMMON_RULES), COMMON_STUB);
  fs.writeFileSync(path.join(dir, PROJECT_RULES), PROJECT_STUB);
  writeMcpJson(path.join(dir, ".mcp.json"), { mcpServers: {} });
  writeLock(cwd, emptyLock());

  console.log(
    `Created ${AGENTIC_DIR}/ (${COMMON_RULES}, ${PROJECT_RULES}, references/, skills/, agents/, .mcp.json, agentic.lock)`
  );
  console.log(`Next: \`agentic install <harness>\` and/or \`agentic link <platform>\`.`);
}
