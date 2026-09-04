#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { program } from "commander";
import { initCommand } from "./commands/init.js";
import { installCommand } from "./commands/install.js";
import { updateCommand } from "./commands/update.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { linkCommand, unlinkCommand } from "./commands/link.js";
import { statusCommand } from "./commands/status.js";
import { mcpAddCommand, mcpRemoveCommand, mcpListCommand } from "./commands/mcp.js";
import { injectCommand } from "./commands/inject.js";
import { ejectCommand } from "./commands/eject.js";
import { migrateCommand } from "./commands/migrate.js";
import { isPlatformId, PLATFORM_IDS, type PlatformId } from "./lib/platforms.js";
import { CURRENT_PROTOCOL } from "./lib/protocol.js";

const cwd = process.cwd();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"));

function platformArg(s: string): PlatformId {
  if (!isPlatformId(s)) {
    console.error(`Error: platform must be one of: ${PLATFORM_IDS.join(", ")}`);
    process.exit(1);
  }
  return s;
}

program
  .name("agentic")
  .version(`${pkg.version} (harness protocol ${CURRENT_PROTOCOL})`)
  .description(
    "Seed an agentic harness into .agentic/ and link it into each AI coding client's config"
  );

program
  .command("init")
  .description("Create a bare .agentic/ with no harness")
  .action(() => initCommand(cwd));

program
  .command("install <harness>")
  .description("Seed a harness (git URL or path, optional #ref) into .agentic/")
  .action((spec: string) => installCommand(cwd, spec));

program
  .command("update [harness]")
  .description("Pull the installed harness (or the given source) and reconcile against the lock")
  .option("--force", "take the upstream side of every conflict", false)
  .action((spec: string | undefined, opts: { force: boolean }) => updateCommand(cwd, spec, opts));

program
  .command("uninstall")
  .description("Remove the harness from .agentic/; project-owned content stays")
  .action(() => uninstallCommand(cwd));

program
  .command("link <platform>")
  .description(`Derive a platform's config from .agentic/ (${PLATFORM_IDS.join("|")})`)
  .action((p: string) => linkCommand(cwd, platformArg(p)));

program
  .command("unlink <platform>")
  .description("Remove what `link` created for a platform")
  .action((p: string) => unlinkCommand(cwd, platformArg(p)));

program
  .command("migrate")
  .description("Bring .agentic/ up to this version's protocol (update does this first)")
  .action(() => migrateCommand(cwd));

program
  .command("status")
  .description("Show harness, linked platforms, and drift (exit 1 on drift)")
  .action(() => statusCommand(cwd));

program
  .command("inject <platform>")
  .description("Import a platform's standalone config into .agentic/")
  .action(async (p: string) => injectCommand(cwd, platformArg(p)));

program
  .command("eject")
  .description("Flatten linked platforms to standalone files and remove .agentic/")
  .action(() => ejectCommand(cwd));

const mcp = program.command("mcp").description("Manage MCP servers in .agentic/.mcp.json");

mcp
  .command("add <name> <command> [args...]")
  .description("Add an MCP server (env values must be ${NAME} references)")
  .option("--env <pairs...>", "Environment variables (KEY=${NAME})")
  .action((name: string, command: string, args: string[], opts: { env?: string[] }) => {
    const env: Record<string, string> = {};
    for (const pair of opts.env ?? []) {
      const eq = pair.indexOf("=");
      if (eq === -1) {
        console.error(`Invalid --env format: ${pair}. Use KEY=VALUE.`);
        process.exit(1);
      }
      env[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    mcpAddCommand(cwd, name, command, args, env);
  });

mcp
  .command("remove <name>")
  .description("Remove an MCP server")
  .action((name: string) => mcpRemoveCommand(cwd, name));

mcp
  .command("list")
  .description("List configured MCP servers")
  .action(() => mcpListCommand(cwd));

program.parse();
