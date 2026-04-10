# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-04-10

### Added
- Initial public release
- **Missing file detection** - Find imports pointing to non-existent files
- **Missing export detection** - Detect imports requesting symbols that don't exist
- **Alias resolution** - Support for TypeScript path aliases (@/, #/, etc.)
- **Watch mode** - Continuously monitor files for changes during development
- **JSON output** - Machine-readable output for CI/CD pipelines
- **Monorepo support** - Works with pnpm workspaces, Turborepo, and Nx
- **Case-sensitive validation** - Catches mismatched filename casing issues
- **Export validation** - Validates that imported symbols actually exist in the source
- **Barrel file support** - Follows re-exports through index files
- **GitHub Actions CI** - Automated testing on push and pull requests
- **npm publish automation** - Automatic publishing on GitHub Release

### Features
- Supports TypeScript, JavaScript, React (`.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.mtsx`, `.mjs`, `.mjsx`)
- Configurable ignore patterns
- Verbose output mode
- Human-readable and JSON output formats
- Exit codes for CI/CD integration (0: success, 1: errors found, 2: internal error)

### Architecture
- Modular design: Scanner, Parser, Resolver, Validator, Reporter
- Production-ready TypeScript with strict type checking
- Comprehensive test suite with Vitest
- ESM modules with proper Node.js compatibility