import * as fs from "node:fs";
import * as path from "node:path";
import type { PlatformId } from "./platforms.js";
import { PLATFORMS } from "./platforms.js";

/**
 * Add platform-specific entries to .gitignore under a comment header.
 * Idempotent: replaces existing block if present.
 */
export function addPlatformEntries(
  cwd: string,
  platform: PlatformId
): void {
  const mapping = PLATFORMS[platform];
  const gitignorePath = path.join(cwd, ".gitignore");
  let content = readGitignore(gitignorePath);

  // Remove existing block for this platform if present
  content = removeBlock(content, mapping.gitignoreHeader);

  // Append new block
  const block = [
    "",
    mapping.gitignoreHeader,
    ...mapping.gitignoreEntries,
  ].join("\n");

  content = content.trimEnd() + "\n" + block + "\n";

  fs.writeFileSync(gitignorePath, content);
}

/**
 * Remove platform-specific entries from .gitignore.
 */
export function removePlatformEntries(
  cwd: string,
  platform: PlatformId
): void {
  const mapping = PLATFORMS[platform];
  const gitignorePath = path.join(cwd, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return;

  let content = readGitignore(gitignorePath);
  content = removeBlock(content, mapping.gitignoreHeader);
  fs.writeFileSync(gitignorePath, content.trimEnd() + "\n");
}

/**
 * Remove all agentic-managed entries from .gitignore (for eject).
 */
export function removeAllAgenticEntries(cwd: string): void {
  const gitignorePath = path.join(cwd, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return;

  let content = readGitignore(gitignorePath);
  for (const mapping of Object.values(PLATFORMS)) {
    content = removeBlock(content, mapping.gitignoreHeader);
  }
  fs.writeFileSync(gitignorePath, content.trimEnd() + "\n");
}

function readGitignore(filePath: string): string {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Remove a block starting with the given header comment.
 * A block runs from the header line until the next blank line
 * followed by a comment, or until EOF.
 */
function removeBlock(content: string, header: string): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let skipping = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === header) {
      skipping = true;
      // Also skip a preceding blank line if present
      if (result.length > 0 && result[result.length - 1] === "") {
        result.pop();
      }
      continue;
    }

    if (skipping) {
      // Stop skipping at a blank line or another comment header
      if (lines[i] === "" || lines[i].startsWith("#")) {
        skipping = false;
        result.push(lines[i]);
      }
      continue;
    }

    result.push(lines[i]);
  }

  return result.join("\n");
}
