#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";

const VERSION = "1.0.0";
const DEFAULT_CONFIG = {
  output: "scope-context.txt",
  include: ["."],
  exclude: [
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".cache",
    ".next",
    ".vite",
    ".venv",
    "__pycache__",
    ".idea",
    ".vscode",
    ".DS_Store",
  ],
  excludeFiles: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"],
  excludePaths: [],
  extensions: [
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".swift",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".html",
    ".htm",
    ".vue",
    ".svelte",
    ".astro",
    ".json",
    ".jsonc",
    ".yaml",
    ".yml",
    ".xml",
    ".toml",
    ".ini",
    ".env.example",
    ".md",
    ".mdx",
    ".txt",
    ".sh",
    ".bash",
    ".zsh",
    ".php",
    ".rb",
    ".sql",
    ".graphql",
    ".gql",
    ".svg",
  ],
  maxFileSize: 1048576,
};
const SPECIAL = new Set([
  "Dockerfile",
  "Makefile",
  "Procfile",
  "LICENSE",
  "README",
  "README.md",
  "README.txt",
  ".scope.json",
  ".gitignore",
]);
const SECRET_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  "credentials.json",
  "service-account.json",
  "id_rsa",
  "id_ed25519",
]);
const SECRET_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx"]);

const ansi = (code, s) =>
  process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;
const bold = (s) => ansi(1, s);
const dim = (s) => ansi(2, s);
const green = (s) => ansi(32, s);
const red = (s) => ansi(31, s);
const yellow = (s) => ansi(33, s);
const cyan = (s) => ansi(36, s);
const fail = (message, code = 1) => {
  console.error(`${red("✗")} ${message}`);
  process.exitCode = code;
};
const humanSize = (bytes) => {
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes,
    i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
};
const rel = (root, p) => path.relative(root, p) || ".";

function parseArgs(argv) {
  const args = { _: [], json: false, depth: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--version" || a === "-v") args.version = true;
    else if (a === "--depth") {
      const v = argv[++i];
      args.depth = Number(v);
    } else if (a.startsWith("--depth=")) args.depth = Number(a.slice(8));
    else args._.push(a);
  }
  return args;
}

function loadConfig(root) {
  const file = path.join(root, ".scope.json");
  if (!fs.existsSync(file))
    return { config: { ...DEFAULT_CONFIG }, exists: false, error: null };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const c = { ...DEFAULT_CONFIG, ...raw };
    if (
      !Array.isArray(c.include) ||
      !Array.isArray(c.exclude) ||
      !Array.isArray(c.excludeFiles) ||
      !Array.isArray(c.excludePaths) ||
      !Array.isArray(c.extensions)
    )
      throw new Error(
        "include, exclude, excludeFiles, excludePaths and extensions must be arrays",
      );
    if (typeof c.output !== "string" || !c.output.trim())
      throw new Error("output must be a non-empty string");
    if (!Number.isInteger(c.maxFileSize) || c.maxFileSize <= 0)
      throw new Error("maxFileSize must be a positive integer");
    return { config: c, exists: true, error: null };
  } catch (e) {
    return { config: { ...DEFAULT_CONFIG }, exists: true, error: e.message };
  }
}

function isSecret(relPath) {
  const normalized = relPath.split(path.sep).join("/");
  const base = path.basename(normalized);
  if (SECRET_NAMES.has(base)) return true;
  if ([...SECRET_EXTENSIONS].some((ext) => base.endsWith(ext))) return true;
  if (base.startsWith(".env.") && base !== ".env.example") return true;
  return false;
}
function isAllowedFile(name, config) {
  if (SPECIAL.has(name)) return true;
  const lower = name.toLowerCase();
  return config.extensions.some((ext) => lower.endsWith(ext.toLowerCase()));
}
function shouldExclude(relPath, config) {
  const parts = relPath.split(path.sep).filter(Boolean);
  if (parts.some((p) => config.exclude.includes(p))) return true;
  if (config.excludeFiles.includes(path.basename(relPath))) return true;
  const normalized = relPath.split(path.sep).join("/");
  return config.excludePaths.some(
    (p) =>
      normalized === p || normalized.startsWith(p.replace(/\/$/, "") + "/"),
  );
}
function inside(root, target) {
  const r = path.resolve(root),
    t = path.resolve(target);
  return t === r || t.startsWith(r + path.sep);
}
function includedByConfig(relPath, config) {
  const clean = relPath.split(path.sep).join("/");
  return config.include.some(
    (item) =>
      item === "." ||
      clean === item ||
      clean.startsWith(item.replace(/\/$/, "") + "/"),
  );
}
function walk(root, config) {
  const entries = [];
  const skipped = [];
  const seen = new Set();
  const visit = (dir) => {
    let names;
    try {
      names = fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      skipped.push({ path: rel(root, dir), reason: e.code || e.message });
      return;
    }
    for (const ent of names) {
      const full = path.join(dir, ent.name),
        rp = rel(root, full);
      if (shouldExclude(rp, config) || !includedByConfig(rp, config)) continue;
      let st;
      try {
        st = fs.lstatSync(full);
      } catch (e) {
        skipped.push({ path: rp, reason: e.code || e.message });
        continue;
      }
      if (st.isSymbolicLink()) {
        let target;
        try {
          target = fs.realpathSync(full);
          if (!inside(root, target))
            skipped.push({ path: rp, reason: "symlink outside project root" });
          else {
            const key = fs.realpathSync(full);
            if (!seen.has(key)) {
              seen.add(key);
              const ts = fs.statSync(full);
              if (ts.isDirectory()) visit(full);
              else
                entries.push({
                  path: rp,
                  type: "file",
                  size: ts.size,
                  symlink: true,
                });
            }
          }
        } catch (e) {
          skipped.push({ path: rp, reason: "broken symbolic link" });
        }
        continue;
      }
      if (st.isDirectory()) {
        entries.push({ path: rp, type: "directory" });
        visit(full);
        continue;
      }
      if (st.isFile()) {
        if (isSecret(rp)) {
          skipped.push({ path: rp, reason: "sensitive file" });
          continue;
        }
        const textual = isAllowedFile(ent.name, config);
        entries.push({
          path: rp,
          type: "file",
          size: st.size,
          textual,
          tooLarge: st.size > config.maxFileSize,
        });
      }
    }
  };
  visit(root);
  return { entries, skipped };
}
function inspectFile(root, config, file) {
  const target = path.resolve(root, file);
  if (!inside(root, target))
    throw new Error("Path is outside the project root");
  if (!fs.existsSync(target)) throw new Error(`File does not exist: ${file}`);
  const st = fs.lstatSync(target);
  if (!st.isFile()) throw new Error("Path is not a regular file");
  const rp = rel(root, target);
  if (isSecret(rp)) throw new Error("Refusing to inspect a sensitive file");
  if (!isAllowedFile(path.basename(target), config))
    throw new Error("File type is not recognized as text");
  if (st.size > config.maxFileSize)
    throw new Error(
      `File exceeds maxFileSize (${humanSize(config.maxFileSize)})`,
    );
  const content = fs.readFileSync(target, "utf8");
  return {
    path: rp,
    size: st.size,
    lines: content === "" ? 0 : content.split(/\r?\n/).length,
    encoding: "UTF-8",
    content,
  };
}
function projectData(root, config) {
  const { entries, skipped } = walk(root, config);
  const files = entries.filter((e) => e.type === "file");
  const dirs = entries.filter((e) => e.type === "directory");
  const text = files.filter((e) => e.textual && !e.tooLarge);
  const binary = files.filter((e) => !e.textual);
  const tooLarge = files.filter((e) => e.tooLarge);
  const ext = {};
  let contextSize = 0,
    totalLines = 0;
  for (const f of text) {
    const extn = path.extname(f.path).toLowerCase() || "[no extension]";
    ext[extn] = (ext[extn] || 0) + 1;
    try {
      const c = fs.readFileSync(path.join(root, f.path), "utf8");
      contextSize += Buffer.byteLength(c);
      totalLines += c === "" ? 0 : c.split(/\r?\n/).length;
    } catch {}
  }
  return {
    entries,
    skipped,
    files,
    dirs,
    text,
    binary,
    tooLarge,
    stats: {
      files: files.length,
      directories: dirs.length,
      textFiles: text.length,
      binaryFiles: binary.length,
      totalSize: files.reduce((n, f) => n + f.size, 0),
      contextSize,
      lines: totalLines,
      extensions: ext,
      excluded: skipped.length,
    },
  };
}
function treeText(data, depth = Infinity) {
  const nodes = new Map([[".", []]]);
  for (const e of data.entries) {
    const parts = e.path.split(path.sep);
    if (parts.length > depth + 1) continue;
    let cur = ".";
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i],
        key = cur + "/" + p;
      if (!nodes.has(cur)) nodes.set(cur, []);
      if (!nodes.get(cur).some((x) => x.name === p))
        nodes
          .get(cur)
          .push({
            name: p,
            type: i === parts.length - 1 ? e.type : "directory",
          });
      cur = key;
      if (!nodes.has(cur)) nodes.set(cur, []);
    }
  }
  const lines = [];
  const render = (parent, prefix) => {
    const kids = (nodes.get(parent) || []).sort((a, b) =>
      a.type === b.type
        ? a.name.localeCompare(b.name)
        : a.type === "directory"
          ? -1
          : 1,
    );
    for (const k of kids) {
      lines.push(prefix + k.name + (k.type === "directory" ? "/" : ""));
      if (k.type === "directory") render(parent + "/" + k.name, prefix + "  ");
    }
  };
  render(".", "");
  return lines.join("\n");
}
function contextText(root, data, config) {
  const name = path.basename(root);
  const s = data.stats;
  const lines = [];
  lines.push(
    "PROJECT CONTEXT",
    "===============",
    `Project: ${name}`,
    `Root: ${root}`,
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "PROJECT STATISTICS",
    "==================",
    `Files: ${s.files}`,
    `Directories: ${s.directories}`,
    `Text files: ${s.textFiles}`,
    `Binary files: ${s.binaryFiles}`,
    `Total size: ${humanSize(s.totalSize)}`,
    `Context size: ${humanSize(s.contextSize)}`,
    `Lines: ${s.lines}`,
    "",
    "PROJECT TREE",
    "============",
    treeText(data),
    "",
    "FILES",
    "=====",
  );
  for (const f of data.text.sort((a, b) => a.path.localeCompare(b.path))) {
    let content;
    try {
      content = fs.readFileSync(path.join(root, f.path), "utf8");
    } catch {
      continue;
    }
    lines.push(
      `FILE: ${f.path}`,
      "------------------",
      content.replace(/\r\n/g, "\n").replace(/\u0000/g, ""),
    );
  }
  return lines.join("\n") + "\n";
}
function printHelp() {
  console.log(
    `${bold("Scope")} — minimal project exploration and context builder\n\nUsage:\n  scope [command] [options]\n\nCommands:\n  scope             Build project context (same as scope build)\n  scope init        Create .scope.json\n  scope build       Generate scope-context.txt\n  scope tree        Show project tree\n  scope stats       Show project statistics\n  scope inspect <file>  Show file metadata and content\n  scope doctor      Check project/configuration health\n  scope help        Show this help\n\nOptions:\n  -h, --help        Show help\n  -v, --version     Show version\n  --json            Machine-readable JSON output\n  --depth <n>       Limit tree depth\n\nExamples:\n  scope\n  scope init\n  scope tree 3\n  scope tree --depth 2\n  scope stats --json\n  scope inspect src/index.js\n  scope build`,
  );
}
function init(root) {
  const file = path.join(root, ".scope.json");
  if (fs.existsSync(file)) {
    console.log(
      `${yellow("!")} .scope.json already exists. Nothing was overwritten.`,
    );
    return;
  }
  fs.writeFileSync(file, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
  console.log(`${green("✓")} Created .scope.json`);
}
function doctor(root, configInfo) {
  const checks = [];
  checks.push({
    name: "Node.js",
    ok: Number(process.versions.node.split(".")[0]) >= 18,
    value: process.version,
  });
  checks.push({ name: "Project root", ok: fs.existsSync(root), value: root });
  checks.push({
    name: "Configuration",
    ok: !configInfo.error,
    value: configInfo.exists ? ".scope.json" : "defaults",
  });
  if (!configInfo.error) {
    for (const p of configInfo.config.include) {
      const t = path.resolve(root, p);
      checks.push({
        name: `Include: ${p}`,
        ok: inside(root, t) && fs.existsSync(t),
        value: inside(root, t) ? t : "outside root",
      });
    }
    const out = path.resolve(root, configInfo.config.output);
    checks.push({ name: "Output path", ok: inside(root, out), value: out });
  }
  return checks;
}

function main() {
  const root = process.cwd(),
    args = parseArgs(process.argv.slice(2));
  if (args.version) {
    console.log(VERSION);
    return;
  }
  if (args.help || args._[0] === "help") {
    printHelp();
    return;
  }
  const command = args._[0] || "build";
  const configInfo = loadConfig(root);
  if (configInfo.error && command !== "doctor") {
    fail(`Invalid .scope.json: ${configInfo.error}`);
    return;
  }
  const config = configInfo.config;
  try {
    if (command === "init") {
      init(root);
      return;
    }
    if (command === "doctor") {
      const checks = doctor(root, configInfo);
      if (args.json) {
        console.log(
          JSON.stringify({ ok: checks.every((c) => c.ok), checks }, null, 2),
        );
        return;
      }
      console.log(
        bold("SCOPE DOCTOR"),
        "\n────────────\n" +
          checks
            .map(
              (c) =>
                `  ${c.ok ? green("✓") : red("✗")} ${c.name.padEnd(18)} ${c.value}`,
            )
            .join("\n") +
          "\n" +
          (checks.every((c) => c.ok)
            ? "No problems found."
            : "Problems found."),
      );
      if (!checks.every((c) => c.ok)) process.exitCode = 1;
      return;
    }
    if (!["build", "tree", "stats", "inspect"].includes(command)) {
      fail(`Unknown command: ${command}\nRun: scope help`);
      return;
    }
    const data = projectData(root, config);
    if (command === "tree") {
      let depth = args.depth;
      if (depth === null && args._[1]) depth = Number(args._[1]);
      if (depth !== null && (!Number.isInteger(depth) || depth < 0)) {
        fail("Depth must be a non-negative integer");
        return;
      }
      const out = {
        root,
        tree: treeText(data, depth === null ? Infinity : depth),
        entries: data.entries,
      };
      if (args.json) {
        console.log(JSON.stringify(out, null, 2));
        return;
      }
      console.log(
        bold("PROJECT TREE"),
        "\n─────────────\n" + treeText(data, depth === null ? Infinity : depth),
      );
      return;
    }
    if (command === "stats") {
      const out = { root, stats: data.stats };
      if (args.json) {
        console.log(JSON.stringify(out, null, 2));
        return;
      }
      const ex = Object.entries(data.stats.extensions).sort(
        (a, b) => b[1] - a[1],
      );
      console.log(
        bold("PROJECT STATISTICS"),
        "\n──────────────────\n" +
          `  Files             ${data.stats.files}\n  Directories       ${data.stats.directories}\n  Text files        ${data.stats.textFiles}\n  Binary files      ${data.stats.binaryFiles}\n  Total size        ${humanSize(data.stats.totalSize)}\n  Context size      ${humanSize(data.stats.contextSize)}\n  Lines             ${data.stats.lines}\n  Skipped           ${data.stats.excluded}\n  Extensions\n` +
          ex.map(([k, v]) => `    ${k.padEnd(14)} ${v}`).join("\n"),
      );
      return;
    }
    if (command === "inspect") {
      if (!args._[1]) {
        fail("Missing file path. Example: scope inspect src/index.js");
        return;
      }
      const info = inspectFile(root, config, args._[1]);
      if (args.json) {
        console.log(JSON.stringify(info, null, 2));
        return;
      }
      console.log(
        bold("FILE"),
        "\n────\n" +
          `  Path        ${info.path}\n  Size        ${humanSize(info.size)}\n  Lines       ${info.lines}\n  Encoding    ${info.encoding}\n\n` +
          bold("CONTENT"),
        "\n───────\n" + info.content,
      );
      return;
    }
    const output = path.resolve(root, config.output);
    if (!inside(root, output))
      throw new Error(
        "Configured output path must stay inside the project root",
      );
    const context = contextText(root, data, config);
    fs.writeFileSync(output, context, "utf8");
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            root,
            output,
            files: data.text.length,
            contextSize: Buffer.byteLength(context),
            durationMs: 0,
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(
      bold("PROJECT CONTEXT BUILDER"),
      "\n────────────────────────\n" +
        `Project\n───────\n  Root     ${root}\n  Output   ${rel(root, output)}\n\nScanning\n────────\n  ${green("✓")} Found ${data.text.length} text files\n\nBuilding Context\n────────────────\n  ${green("✓")} ${data.text.length} files included\n\nComplete\n────────\n  ${green("✓")} Context generated successfully\n  Files         ${data.text.length}\n  Context size  ${humanSize(Buffer.byteLength(context))}\n  Output        ${output}\nContext build finished successfully.`,
    );
  } catch (e) {
    fail(e.message || String(e));
  }
}
main();
