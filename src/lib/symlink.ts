import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Create a relative symlink from linkPath pointing to targetPath.
 * Idempotent: no-op if the symlink already points to the correct target.
 * Errors if linkPath is a real file (not a symlink).
 */
export function safeLink(targetPath: string, linkPath: string): void {
  const linkDir = path.dirname(linkPath);
  const relTarget = path.relative(linkDir, targetPath);

  if (fs.existsSync(linkPath) || isSymlink(linkPath)) {
    if (isSymlink(linkPath)) {
      const current = fs.readlinkSync(linkPath);
      if (current === relTarget) return; // already correct
      fs.unlinkSync(linkPath); // points elsewhere, replace
    } else {
      throw new Error(
        `${linkPath} already exists and is not a symlink. Remove it manually or use \`agentic inject\` to import it first.`
      );
    }
  }

  fs.mkdirSync(linkDir, { recursive: true });
  fs.symlinkSync(relTarget, linkPath);
}

/**
 * Remove a symlink. No-op if it doesn't exist. Errors if it's a real file.
 */
export function removeSymlink(linkPath: string): void {
  if (!fs.existsSync(linkPath) && !isSymlink(linkPath)) return;

  if (!isSymlink(linkPath)) {
    throw new Error(
      `${linkPath} is not a symlink. Remove it manually if intended.`
    );
  }

  fs.unlinkSync(linkPath);
}

/**
 * Check if a path is a symlink pointing to the expected target.
 */
export function isSymlinkTo(linkPath: string, targetPath: string): boolean {
  if (!isSymlink(linkPath)) return false;
  const linkDir = path.dirname(linkPath);
  const relTarget = path.relative(linkDir, targetPath);
  return fs.readlinkSync(linkPath) === relTarget;
}

/**
 * Replace a symlink with a copy of its target (for eject).
 * Handles both file and directory symlinks.
 */
export function flattenSymlink(linkPath: string): void {
  if (!isSymlink(linkPath)) return;

  const realPath = fs.realpathSync(linkPath);
  fs.unlinkSync(linkPath);

  const stat = fs.statSync(realPath);
  if (stat.isDirectory()) {
    fs.cpSync(realPath, linkPath, { recursive: true });
  } else {
    fs.copyFileSync(realPath, linkPath);
  }
}

function isSymlink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
