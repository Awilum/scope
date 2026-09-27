# Scope

Scope is a minimal, dependency-free command-line utility for exploring software projects and building a clean, structured project context as plain text.

Scope runs locally, reads your project according to explicit rules, and produces deterministic text that can be copied into a chat, issue, review, documentation tool, or another text-based development environment.

## Why Scope?

When working on an unfamiliar codebase, developers often need a quick answer to: _What is in this project, and what does the relevant source actually contain?_ Scope turns that task into one command.

```bash
scope
```

The default command builds `scope-context.txt`, containing project metadata, statistics, a complete readable tree, and the contents of recognized text files.

## Requirements

- Node.js 18 or newer
- npm
- No runtime dependencies
- No network connection

## Installation

Global installation from npm:

```bash
npm install -g @awilum/scope
```

Or from a local clone:

```bash
git clone <repository>
cd scope
npm install -g .
```

For local development, `npm link` is also supported:

```bash
npm link
```

Then verify:

```bash
scope --version
```

## Quick start

From any project directory:

```bash
cd my-project
scope init
scope tree
scope stats
scope inspect src/index.js
scope build
```

The shortest workflow is simply:

```bash
scope
```

which is equivalent to `scope build`.

## Commands

### `scope`

Builds project context using the current directory and `.scope.json` if present.

### `scope init`

Creates `.scope.json` with sensible defaults. Existing configuration is never overwritten.

### `scope build`

Generates `scope-context.txt` by default.

The output contains:

1. project metadata;
2. statistics;
3. project tree;
4. recognized text-file contents.

File boundaries are explicit:

```text
FILE: src/app.js
------------------
import ...
```

Generated context contains no ANSI terminal escape sequences and uses relative paths for file content.

### `scope tree`

Displays a readable project tree.

```bash
scope tree
scope tree 3
scope tree --depth 2
```

### `scope stats`

Displays file, directory, text/binary, size, line, skipped-file, and extension statistics.

### `scope inspect <file>`

Displays metadata and the content of one recognized text file.

```bash
scope inspect package.json
scope inspect src/index.js
```

The path is resolved inside the current project root. Traversal outside the root is rejected.

### `scope doctor`

Checks Node.js, the project root, configuration, include paths, and output path.

A missing `.scope.json` is normal: Scope simply uses defaults.

### `scope help`

Prints command help.

### `scope --version`

Prints the installed version.

## JSON mode

The tree, statistics, inspect, and doctor commands support machine-readable output:

```bash
scope tree --json
scope stats --json
scope inspect package.json --json
scope doctor --json
```

JSON output contains no ANSI styling or progress messages and is suitable for scripts.

## Configuration

Scope looks for `.scope.json` in the current project root.

Example:

```json
{
  "output": "scope-context.txt",
  "include": ["."],
  "exclude": ["node_modules", ".git", "dist", "build", "coverage"],
  "excludeFiles": ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"],
  "excludePaths": [],
  "extensions": [".js", ".ts", ".tsx", ".json", ".md"],
  "maxFileSize": 1048576
}
```

### `output`

Output filename for `scope build`. The output must remain inside the project root.

### `include`

Relative files or directories to process. The default is `["."]`.

### `exclude`

Directory names that are not traversed. Common generated and dependency directories are excluded by default.

### `excludeFiles`

Exact filenames that are skipped.

### `excludePaths`

Relative path prefixes that are skipped.

### `extensions`

Recognized textual file extensions. Files without extensions such as `Dockerfile`, `Makefile`, `Procfile`, `LICENSE`, and `README` are recognized as well.

### `maxFileSize`

Maximum file size read into context. The default is 1 MiB.

## Security and privacy

Scope is local-only. It does not upload, transmit, or call an external service.

Sensitive files are skipped by default, including environment files and common private credentials such as `.pem`, `.key`, `.p12`, `.pfx`, `id_rsa`, `id_ed25519`, `credentials.json`, and `service-account.json`.

Binary files are never copied into generated context. Files larger than `maxFileSize` are skipped from content generation.

Configuration is an explicit trust boundary: if you intentionally add a sensitive file to an allowed configuration, you are responsible for that choice.

## Generated context format

A typical context looks like:

```text
PROJECT CONTEXT
===============
Project: my-project
Root: /path/to/my-project
Generated: 2026-09-27

PROJECT STATISTICS
==================
Files: 42
Directories: 9
Text files: 37
Binary files: 5
Total size: 482.0 KB
Context size: 310.2 KB
Lines: 8421

PROJECT TREE
============
src/
  config.js
  index.js
package.json
README.md

FILES
=====
FILE: package.json
------------------
{ ... }

FILE: src/index.js
------------------
import ...
```

The representation is deliberately plain text, stable, and easy to copy.

## Supported text formats

The default configuration recognizes common JavaScript, TypeScript, Python, Go, Rust, Java, Kotlin, Swift, C/C++, CSS, HTML, Vue, Svelte, Astro, JSON, YAML, XML, TOML, Markdown, shell, PHP, Ruby, SQL, GraphQL, SVG, and related formats.

The extension list is configurable.

## Development

Run the CLI directly without installing it globally:

```bash
node bin/scope.js --version
node bin/scope.js help
```

Check syntax:

```bash
npm run check
```

Test the CLI in the repository:

```bash
node bin/scope.js doctor
node bin/scope.js tree
node bin/scope.js stats
node bin/scope.js inspect package.json
node bin/scope.js build
```

Then test the global command:

```bash
npm install -g .
scope --version
```

Or:

```bash
npm link
scope --version
```

## Publishing to npm

After choosing and confirming an available package name and authenticating with npm:

```bash
npm publish --access public
```

For the scoped package name used by this repository:

```bash
npm install -g @awilum/scope
```

## GitHub usage

The repository is intentionally small and can be inspected without learning a framework. A typical first commit is:

```bash
git init
git add .
git commit -m "Initial release"
git remote add origin <repository>
git push -u origin main
```

The repository intentionally excludes `node_modules`, generated context files, logs, and macOS metadata.

## Troubleshooting

### `scope: command not found`

Confirm that the global npm bin directory is on your `PATH`, then reinstall:

```bash
npm install -g .
```

### Configuration errors

Run:

```bash
scope doctor
```

Fix the reported `.scope.json` values and run the command again.

### A file is missing from context

Check whether it is:

- excluded by directory name;
- listed in `excludeFiles` or `excludePaths`;
- a recognized text extension;
- larger than `maxFileSize`;
- recognized as a sensitive file.

Use `scope stats` to see skipped counts.

### A file is outside the configured root

Scope intentionally refuses `inspect` paths that resolve outside the current project root.

## Project structure

```text
scope/
├── bin/
│   └── scope.js
├── examples/
├── .gitignore
├── .scope.json.example
├── LICENSE
├── package.json
└── README.md
```

The implementation intentionally stays concentrated in one CLI file. Scope is a utility, not a framework.

## License

MIT. See `LICENSE`.
