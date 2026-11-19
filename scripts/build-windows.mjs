#!/usr/bin/env node
/**
 * Local Windows build entry point.
 *
 * Everything this script produces stays inside the project (or in a single
 * sibling folder on the same drive), so it can be wiped with `npm run clean`.
 * Nothing is written to C: except what Windows itself caches.
 *
 * Why a build folder instead of `src-tauri/target`:
 * MinGW's `windres` (used for the .exe icon/manifest on the GNU toolchain)
 * breaks when an include path contains a space. The project lives under
 * "Glacier Dock", so cargo gets pointed at a space-free path. If the project
 * path has no spaces, the folder is `<project>/.build`.
 *
 * Usage:
 *   node scripts/build-windows.mjs             # release .exe into ./release
 *   node scripts/build-windows.mjs --dev       # tauri dev with the same setup
 *   node scripts/build-windows.mjs --installer # also build the NSIS installer
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const isWindows = process.platform === "win32";

const isDev = process.argv.includes("--dev");
const wantInstaller = process.argv.includes("--installer");

// Keep cargo's target dir in a path without spaces; never on another drive.
const buildRoot = /\s/.test(projectRoot)
  ? path.join(
      path.dirname(projectRoot),
      `${path.basename(projectRoot).replace(/\s+/g, "-")}-build`,
    )
  : path.join(projectRoot, ".build");
const targetDir = path.join(buildRoot, "target");
const releaseDir = path.join(projectRoot, "release");

function findOnPath(name) {
  const exts = isWindows ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of (process.env.PATH ?? process.env.Path ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function msvcLinkerAvailable() {
  if (!isWindows) return true;
  return [
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022",
    "C:\\Program Files\\Microsoft Visual Studio\\2019",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2019",
  ].some((candidate) => existsSync(candidate));
}

/**
 * Locate the WebView2Loader.dll that wry linked against. Cargo usually leaves
 * a copy beside the exe; older webview2-com-sys versions only put it in the
 * build script's out/<arch>/ folder, so fall back to that.
 */
function findWebView2Loader(builtDir) {
  const direct = path.join(builtDir, "WebView2Loader.dll");
  if (existsSync(direct)) return direct;

  const archDir = process.arch === "arm64" ? "arm64" : process.arch === "ia32" ? "x86" : "x64";
  const buildRootDir = path.join(builtDir, "build");
  if (!existsSync(buildRootDir)) return undefined;

  for (const entry of readdirSync(buildRootDir)) {
    if (!entry.startsWith("webview2-com-sys-")) continue;
    for (const candidate of [
      path.join(buildRootDir, entry, "out", archDir, "WebView2Loader.dll"),
      path.join(buildRootDir, entry, "out", "WebView2Loader.dll"),
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

/** MinGW is the fallback when no MSVC linker is installed. */
function pickRustToolchain() {
  if (process.env.GLACIER_RUST_TOOLCHAIN) return process.env.GLACIER_RUST_TOOLCHAIN;
  if (isWindows && !msvcLinkerAvailable()) return "stable-x86_64-pc-windows-gnu";
  return undefined;
}

const env = { ...process.env, CARGO_TARGET_DIR: targetDir };

const toolchain = pickRustToolchain();
if (toolchain) {
  const which = spawnSync("rustup", ["which", "--toolchain", toolchain, "rustc"], {
    encoding: "utf8",
  });
  const rustcPath = which.stdout?.trim();
  if (which.status === 0 && rustcPath && existsSync(rustcPath)) {
    env.RUSTUP_TOOLCHAIN = toolchain;
    // Windows exposes the path as "Path" in some shells and "PATH" in others.
    // Keep both in sync or prepending rustc wipes npm from the child process.
    const currentPath = env.PATH ?? env.Path ?? "";
    const combined = `${path.dirname(rustcPath)}${path.delimiter}${currentPath}`;
    env.PATH = combined;
    env.Path = combined;
    console.log(`toolchain: ${toolchain}`);
  } else {
    console.warn(`warning: rustup toolchain "${toolchain}" is not installed`);
  }
  if (toolchain.includes("windows-gnu") && !findOnPath("gcc")) {
    console.warn(
      "warning: gcc/windres were not found on PATH; install a MinGW-w64 toolchain " +
        "(e.g. WinLibs) or install Visual Studio Build Tools for the MSVC toolchain.",
    );
  }
}

mkdirSync(targetDir, { recursive: true });
console.log(`project:  ${projectRoot}`);
console.log(`build:    ${targetDir}`);

function run(args) {
  const cli = path.join(projectRoot, "node_modules", "@tauri-apps", "cli", "tauri.js");
  const result = existsSync(cli)
    ? spawnSync(process.execPath, [cli, ...args], { cwd: projectRoot, env, stdio: "inherit" })
    : spawnSync("npx", ["tauri", ...args], { cwd: projectRoot, env, stdio: "inherit", shell: isWindows });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (isDev) {
  run(["dev"]);
} else {
  run(["build", ...(wantInstaller ? ["--bundles", "nsis"] : ["--no-bundle"])]);

  const builtDir = path.join(targetDir, "release");
  const copied = [];
  const exe = existsSync(builtDir)
    ? readdirSync(builtDir)
        .filter((name) => name.toLowerCase().endsWith(".exe"))
        .map((name) => path.join(builtDir, name))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
    : undefined;

  if (exe) {
    mkdirSync(releaseDir, { recursive: true });
    const destination = path.join(releaseDir, "glacier-dock.exe");
    copyFileSync(exe, destination);
    copied.push(destination);

    // wry/webview2-com links against WebView2Loader.dll dynamically. The
    // Tauri bundler copies it into installers, but `--no-bundle` builds (the
    // default here) leave it only in the cargo target dir. Ship it next to
    // the standalone exe, otherwise Windows shows:
    //   "The code execution cannot proceed because WebView2Loader.dll was not found."
    const loader = findWebView2Loader(builtDir);
    if (loader) {
      const loaderDestination = path.join(releaseDir, "WebView2Loader.dll");
      copyFileSync(loader, loaderDestination);
      copied.push(loaderDestination);
    } else {
      console.warn(
        "warning: WebView2Loader.dll was not found in the cargo output; " +
          "the standalone exe will not start on machines without a matching copy",
      );
    }
  }

  const bundleDir = path.join(builtDir, "bundle", "nsis");
  if (wantInstaller && existsSync(bundleDir)) {
    mkdirSync(releaseDir, { recursive: true });
    for (const name of readdirSync(bundleDir)) {
      if (!name.toLowerCase().endsWith(".exe")) continue;
      const destination = path.join(releaseDir, name);
      copyFileSync(path.join(bundleDir, name), destination);
      copied.push(destination);
    }
  }

  if (!copied.length) {
    console.error("build finished but no .exe was produced");
    process.exit(1);
  }

  console.log("\nartifacts kept in the project:");
  for (const file of copied) {
    const size = (statSync(file).size / (1024 * 1024)).toFixed(1);
    console.log(`  ${file}  (${size} MB)`);
  }
  console.log("\nrun it:  release\\glacier-dock.exe");
  console.log("wipe it: npm run clean");
}
