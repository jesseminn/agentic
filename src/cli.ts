#!/usr/bin/env node

import { program } from "commander";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { mcpAddCommand, mcpRemoveCommand, mcpListCommand } from "./commands/mcp.js";
import { installCommand } from "./commands/install.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { injectCommand } from "./commands/inject.js";
import { ejectCommand } from "./commands/eject.js";
import { updateCommand } from "./commands/update.js";
import type { PlatformId } from "./lib/platforms.js";

const cwd = process.cwd();

program
  .name("agentic")
  .version("0.1.0")
  .description(
    "Manage cross-platform AI agent configuration from a single .agentic/ directory"
  );

program
  .command("init")
  .description("Create a new .agentic/ directory")
  .action(() => initCommand(cwd));

program
  .command("status")
  .description("Show current configuration state")
  .action(() => statusCommand(cwd));

const platformChoices = ["claude", "gemini", "codex"];

program
  .command("install <platform>")
  .description("Derive platform-specific configs from .agentic/")
  .action((platform: string) => {
    if (!platformChoices.includes(platform)) {
      console.error(`Error: platform must be one of: ${platformChoices.join(", ")}`);
      process.exit(1);
    }
    installCommand(cwd, platform as PlatformId);
  });

program
  .command("uninstall <platform>")
  .description("Remove derived configs for a platform")
  .action((platform: string) => {
    if (!platformChoices.includes(platform)) {
      console.error(`Error: platform must be one of: ${platformChoices.join(", ")}`);
      process.exit(1);
    }
    uninstallCommand(cwd, platform as PlatformId);
  });

program
  .command("inject <platform>")
  .description("Import existing platform configs into .agentic/")
  .action(async (platform: string) => {
    if (!platformChoices.includes(platform)) {
      console.error(`Error: platform must be one of: ${platformChoices.join(", ")}`);
      process.exit(1);
    }
    await injectCommand(cwd, platform as PlatformId);
  });

program
  .command("update")
  .description("Update .agentic/ template files to match current package version")
  .action(() => updateCommand(cwd));

program
  .command("eject")
  .description("Flatten symlinks to real files and remove .agentic/")
  .action(() => ejectCommand(cwd));

const mcp = program
  .command("mcp")
  .description("Manage MCP servers");

mcp
  .command("add <name> <command> [args...]")
  .description("Add an MCP server")
  .option("--env <pairs...>", "Environment variables (KEY=VALUE)")
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
