#!/usr/bin/env node
/**
 * Removes every artifact created by the local Windows build:
 * the cargo target dir, the packaged frontend, and the copied .exe files.
 * Nothing outside the project (plus the sibling `*-build` folder used when the
 * project path contains spaces) is touched.
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");

const buildRoot = /\s/.test(projectRoot)
  ? path.join(
      path.dirname(projectRoot),
      `${path.basename(projectRoot).replace(/\s+/g, "-")}-build`,
    )
  : path.join(projectRoot, ".build");

const targets = [
  buildRoot,
  path.join(projectRoot, "release"),
  path.join(projectRoot, "dist"),
  path.join(projectRoot, "src-tauri", "target"),
];

function sizeOf(dir) {
  let total = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      total += entry.isDirectory() ? sizeOf(full) : statSync(full).size;
    }
  } catch {
    /* ignore unreadable entries */
  }
  return total;
}

let freed = 0;
for (const target of targets) {
  if (!existsSync(target)) {
    console.log(`skip    ${target}`);
    continue;
  }
  const size = sizeOf(target);
  rmSync(target, { recursive: true, force: true });
  freed += size;
  console.log(`removed ${target}`);
}

console.log(`\nfreed ${(freed / (1024 * 1024)).toFixed(1)} MB`);
