import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getTemplatePath(name: string): string {
  return path.join(__dirname, "..", "templates", name);
}

function getVersion(): string {
  const pkgPath = path.join(__dirname, "..", "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  return pkg.version;
}

/**
 * Copy a bundled template file to the destination,
 * replacing {{version}} with the current package version.
 */
export function copyTemplate(name: string, destPath: string): void {
  const src = getTemplatePath(name);
  let content = fs.readFileSync(src, "utf-8");
  content = content.replace(/\{\{version\}\}/g, getVersion());
  fs.writeFileSync(destPath, content);
}
