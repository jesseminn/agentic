import * as fs from "node:fs";
import * as path from "node:path";

export type LinkResult = "created" | "retargeted" | "unchanged";

/**
 * Create a relative symlink from linkPath pointing to targetPath.
 * Idempotent: no-op if the symlink already points to the correct target.
 * Errors if linkPath is a real file (not a symlink).
 */
export function safeLink(targetPath: string, linkPath: string): LinkResult {
  const linkDir = path.dirname(linkPath);
  const relTarget = path.relative(linkDir, targetPath);

  if (fs.existsSync(linkPath) || isSymlink(linkPath)) {
    if (isSymlink(linkPath)) {
      const current = fs.readlinkSync(linkPath);
      if (current === relTarget) return "unchanged";
      fs.unlinkSync(linkPath);
      fs.symlinkSync(relTarget, linkPath);
      return "retargeted";
    }
    throw new Error(
      `${linkPath} already exists and is not a symlink. Remove it manually or use \`agentic inject\` to import it first.`
    );
  }

  fs.mkdirSync(linkDir, { recursive: true });
  fs.symlinkSync(relTarget, linkPath);
  return "created";
}

/**
 * Remove a symlink. No-op if it doesn't exist. Errors if it's a real file.
 */
export function removeSymlink(linkPath: string): void {
  if (!fs.existsSync(linkPath) && !isSymlink(linkPath)) return;

  if (!isSymlink(linkPath)) {
    throw new Error(`${linkPath} is not a symlink. Remove it manually if intended.`);
  }

  fs.unlinkSync(linkPath);
}

/** Check if a path is a symlink pointing to the expected target. */
export function isSymlinkTo(linkPath: string, targetPath: string): boolean {
  if (!isSymlink(linkPath)) return false;
  const linkDir = path.dirname(linkPath);
  const relTarget = path.relative(linkDir, targetPath);
  return fs.readlinkSync(linkPath) === relTarget;
}

/**
 * True when `linkPath` is a symlink whose target resolves inside `rootDir`.
 * The target need not exist — dangling links count.
 */
export function isLinkInto(linkPath: string, rootDir: string): boolean {
  if (!isSymlink(linkPath)) return false;
  const target = path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath));
  const rel = path.relative(path.resolve(rootDir), target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** True when a symlink's target does not exist. */
export function isDangling(linkPath: string): boolean {
  if (!isSymlink(linkPath)) return false;
  return !fs.existsSync(linkPath);
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

export function isSymlink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
