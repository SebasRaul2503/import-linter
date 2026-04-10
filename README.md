# @kirisu2503/import-linter

<p align="center">
  <img src="https://img.shields.io/npm/v/@kirisu2503/import-linter?style=flat&color=blue" alt="npm version">
  <img src="https://img.shields.io/node/v/@kirisu2503/import-linter" alt="node version">
  <img src="https://img.shields.io/github/license/kirisu2503/import-linter" alt="license">
  <img src="https://img.shields.io/github/actions/workflow/status/kirisu2503/import-linter/test.yml" alt="CI">
</p>

Detect orphan imports before your app breaks at runtime. A production-ready CLI tool for finding broken imports in TypeScript, JavaScript, and React projects.

## Why @kirisu2503/import-linter?

Every developer has experienced that moment when an app fails at runtime with a cryptic "Cannot find module" error. @kirisu2503/import-linter catches these issues **before deployment** by analyzing your codebase and identifying imports that point to non-existent files or missing exports.

## Features

- **Missing File Detection** - Find imports pointing to files that don't exist
- **Missing Export Detection** - Detect imports requesting exports that aren't available
- **Alias Resolution** - Supports TypeScript path aliases (`@/*`, `#/*`, etc.)
- **Watch Mode** - Continuously monitor for changes during development
- **JSON Output** - Machine-readable results for CI/CD pipelines
- **Monorepo Support** - Works with pnpm workspaces, Turborepo, and Nx
- **Export Validation** - Validates that imported symbols actually exist
- **Case-Sensitive Detection** - Catches mismatched filename casing issues

## Installation

```bash
# Global installation
npm install -g @kirisu2503/import-linter

# Or run directly with npx
npx @kirisu2503/import-linter scan src/
```

## Quick Start

```bash
# Scan a directory
import-linter scan src/

# Watch mode for development
import-linter scan src --watch

# JSON output for CI/CD
import-linter scan src --json

# Verbose output
import-linter scan src --verbose
```

## Usage Examples

### Basic Scan

```bash
$ import-linter scan src/

Scanning..
Import Linter
────────────────────────────────────────

────────────────────────────────────────
Scanned 42 files
Checked 198 imports
Found 0 orphan imports
────────────────────────────────────────
✅ No orphan imports found.
```

### With Errors

```bash
$ import-linter scan src/

Scanning..
Import Linter
────────────────────────────────────────

Errors:

  ❌ src/pages/Home.tsx:4:15
    Missing import: ./components/Boton
    Reason: file does not exist

────────────────────────────────────────
Scanned 42 files
Checked 198 imports
Found 3 orphan imports
────────────────────────────────────────
❌ Found 3 orphan import(s).
```

### Watch Mode

```bash
$ import-linter scan src/ --watch

──────────────────────────────────────────────────
Watch mode enabled. Watching for changes...
Press Ctrl+C to stop.

Scanning..
✅ No orphan imports found.

[14:42:01] File changed: src/pages/Home.tsx
Scanning..
❌ Found 1 orphan import(s).
```

## JSON Output

```json
{
  "success": false,
  "summary": {
    "filesScanned": 42,
    "importsChecked": 198,
    "errorsFound": 3
  },
  "errors": [
    {
      "file": "src/pages/Home.tsx",
      "line": 4,
      "column": 15,
      "importPath": "./components/Boton",
      "errorType": "missing-file",
      "message": "File does not exist"
    }
  ],
  "warnings": []
}
```

## Alias Support

import-linter automatically detects and resolves TypeScript path aliases from your `tsconfig.json` or `jsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@ui/*": ["src/ui/*"],
      "#components/*": ["src/components/*"]
    }
  }
}
```

```typescript
// These imports will be resolved correctly
import { Button } from '@/components/Button';
import { Card } from '@ui/Card';
import { Icon } from '#components/Icon';
```

## Monorepo Support

Works seamlessly with popular monorepo tools:

- **pnpm workspaces** - Automatically detects `pnpm-workspace.yaml`
- **Turborepo** - Supports `turbo.json` configurations
- **Nx** - Integrates with `nx.json` project references
- **Yarn/npm workspaces** - Standard workspace detection

```bash
# Scan entire monorepo
import-linter scan .

# Output:
# Detected pnpm workspace with 3 packages
# Scanned 15 files
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Lint Imports

on: [push, pull_request]

jobs:
  import-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm install -g import-linter
      - run: import-linter scan . --json > import-linter-results.json
      - uses: actions/upload-artifact@v4
        with:
          name: import-linter-results
          path: import-linter-results.json
```

### Exit Codes

- `0` - No errors found
- `1` - Orphan imports detected
- `2` - Internal error or invalid configuration

## Configuration

### Supported File Extensions

- `.ts`, `.tsx`, `.js`, `.jsx`
- `.mts`, `.mtsx`, `.mjs`, `.mjsx`

### Ignored Directories

By default, the following directories are ignored:
- `node_modules/`
- `dist/`, `build/`
- `.git/`
- `.next/`, `.nuxt/`
- `coverage/`, `.cache/`

### Custom Options

```bash
# Include specific patterns
import-linter scan src/ --include "src/**/*.ts,src/**/*.tsx"

# Exclude patterns
import-linter scan src/ --exclude "**/*.test.ts,**/*.spec.ts"

# Output format
import-linter scan src/ --format json
```

## License

MIT - see [LICENSE](LICENSE) for details.

## Author

Sebastian Raul Castillo Vasquez

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

<p align="center">Made with ❤️ for cleaner codebases</p>