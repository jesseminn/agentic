import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { requireAgenticDir, getAgenticDir, PLATFORMS, type PlatformId } from "../lib/platforms.js";
import { COMMON_RULES, PROJECT_RULES } from "../lib/harness.js";
import {
  mcpTomlToJson,
  extractMcpServers,
  mcpAntigravityToJson,
  writeMcpJson,
  agentTomlToMd,
  readMcpJson,
} from "../lib/translate.js";
import { readLock } from "../lib/lock.js";
import { isSymlink } from "../lib/symlink.js";
import { isGenerated } from "../lib/generated.js";

/**
 * Import a platform's existing standalone config into .agentic/ so it can
 * be linked. Only real files are imported — symlinks and generated files
 * are already derived and are skipped. Not available once a harness is
 * installed: the root of .agentic/ is harness territory then.
 */
export async function injectCommand(cwd: string, platform: PlatformId): Promise<void> {
  requireAgenticDir(cwd);
  const agenticDir = getAgenticDir(cwd);

  const lock = readLock(cwd);
  if (lock?.harness) {
    console.error(
      `Error: harness ${lock.harness.name} is installed; inject would overwrite harness-owned files. Add project content under ${PROJECT_RULES} or unprefixed skills instead.`
    );
    process.exit(1);
  }

  if (hasExistingConfigs(agenticDir)) {
    const ok = await confirm("Existing content found in .agentic/. Overwrite matching files?");
    if (!ok) {
      console.log("Aborted.");
      return;
    }
  }

  const m = PLATFORMS[platform];
  copyReal(path.join(cwd, m.rulesRoot), path.join(agenticDir, PROJECT_RULES));

  switch (m.mcp.type) {
    case "symlink":
      copyReal(path.join(cwd, m.mcp.target), path.join(agenticDir, ".mcp.json"));
      break;
    case "merge": {
      const raw = extractMcpServers(path.join(cwd, m.mcp.target));
      const config = m.mcp.dialect === "antigravity" ? mcpAntigravityToJson(raw) : raw;
      if (Object.keys(config.mcpServers).length > 0) {
        writeMcpJson(path.join(agenticDir, ".mcp.json"), config);
        console.log(`  ${m.mcp.target}#mcpServers → .agentic/.mcp.json`);
      }
      break;
    }
    case "translate": {
      const p = path.join(cwd, m.mcp.target);
      if (fs.existsSync(p) && !isGenerated(p)) {
        const config = mcpTomlToJson(fs.readFileSync(p, "utf-8"));
        if (Object.keys(config.mcpServers).length > 0) {
          writeMcpJson(path.join(agenticDir, ".mcp.json"), config);
          console.log(`  ${m.mcp.target} → .agentic/.mcp.json`);
        }
      }
      break;
    }
  }

  copyRealEntries(path.join(cwd, m.skillsDir), path.join(agenticDir, "skills"), m.skillsDir);

  if (m.agentsMode === "link") {
    copyRealEntries(path.join(cwd, m.agentsDir), path.join(agenticDir, "agents"), m.agentsDir);
  } else {
    const src = path.join(cwd, m.agentsDir);
    if (fs.existsSync(src)) {
      const dest = path.join(agenticDir, "agents");
      fs.mkdirSync(dest, { recursive: true });
      for (const file of fs.readdirSync(src)) {
        const p = path.join(src, file);
        if (!file.endsWith(".toml") || isGenerated(p)) continue;
        const mdName = file.replace(/\.toml$/, ".md");
        fs.writeFileSync(path.join(dest, mdName), agentTomlToMd(fs.readFileSync(p, "utf-8")));
        console.log(`  ${m.agentsDir}/${file} → .agentic/agents/${mdName}`);
      }
    }
  }

  const mcpPath = path.join(agenticDir, ".mcp.json");
  if (!fs.existsSync(mcpPath)) writeMcpJson(mcpPath, readMcpJson(mcpPath));

  console.log(
    `\nImported ${platform} config into .agentic/. Remove the originals, then run \`agentic link ${platform}\`.`
  );
}

function hasExistingConfigs(agenticDir: string): boolean {
  for (const f of [COMMON_RULES, PROJECT_RULES]) {
    const p = path.join(agenticDir, f);
    if (fs.existsSync(p) && fs.readFileSync(p, "utf-8").trim().length > 0) return true;
  }
  for (const d of ["skills", "agents"]) {
    const p = path.join(agenticDir, d);
    if (fs.existsSync(p) && fs.readdirSync(p).length > 0) return true;
  }
  const mcp = readMcpJson(path.join(agenticDir, ".mcp.json"));
  return Object.keys(mcp.mcpServers).length > 0;
}

function copyReal(src: string, dest: string): void {
  if (!fs.existsSync(src) || isSymlink(src) || isGenerated(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`  ${path.basename(src)} → ${path.relative(process.cwd(), dest)}`);
}

/** Copy each real (non-symlink) entry of a directory. */
function copyRealEntries(srcDir: string, destDir: string, label: string): void {
  if (!fs.existsSync(srcDir) || isSymlink(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    if (isSymlink(src)) continue;
    fs.cpSync(src, path.join(destDir, name), { recursive: true });
    console.log(`  ${label}/${name} → ${path.relative(process.cwd(), path.join(destDir, name))}`);
  }
}

function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}
