import * as fs from "node:fs";
import * as path from "node:path";
import { AGENTIC_DIR, getAgenticDir } from "../lib/platforms.js";
import { emptyLock, writeLock } from "../lib/lock.js";
import { writeMcpJson } from "../lib/translate.js";

export const PROJECT_STUB = `# Project

Project-specific context. Detailed topic-bundled rules live in \`project/<topic>.md\`.
`;

const RULES_STUB = `# Rules

Behavior rules for agents in this project.

A harness installed with \`agentic install <harness>\` owns this file and
replaces it. Keep project-specific rules in \`PROJECT.md\` and \`project/\`.
`;

/** Create a bare .agentic/ with no harness. */
export function initCommand(cwd: string): void {
  const dir = getAgenticDir(cwd);
  if (fs.existsSync(dir)) {
    console.error(`Error: ${AGENTIC_DIR}/ already exists.`);
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "RULES.md"), RULES_STUB);
  fs.writeFileSync(path.join(dir, "PROJECT.md"), PROJECT_STUB);
  for (const sub of ["rules", "project", "references", "skills", "agents"]) {
    fs.mkdirSync(path.join(dir, sub));
  }
  writeMcpJson(path.join(dir, ".mcp.json"), { mcpServers: {} });
  writeLock(cwd, emptyLock());

  console.log(
    `Created ${AGENTIC_DIR}/ (RULES.md, PROJECT.md, rules/, project/, references/, skills/, agents/, .mcp.json, agentic.lock)`
  );
  console.log(`Next: \`agentic install <harness>\` and/or \`agentic link <platform>\`.`);
}
