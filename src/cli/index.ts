#!/usr/bin/env node

import { Command } from 'commander';
import path from 'node:path';
import fs from 'fs-extra';
import { ScanEngine } from '../scanner/index.js';
import { getDefaultConfig, Config } from '../config/index.js';
import { Reporter } from '../reporter/reporter.js';
import { loadTsConfig, AliasConfig } from '../config/tsconfig-loader.js';
import { detectWorkspace, WorkspaceConfig } from '../config/workspace-loader.js';
import { watchDirectory, FileWatcher, FileChangeEvent } from '../watcher/index.js';

interface ScanCommandOptions {
  include?: string;
  exclude?: string;
  watch: boolean;
  clear?: boolean;
  json?: boolean;
  verbose: boolean;
  format: 'text' | 'json';
}

async function runScan(
  absolutePath: string,
  config: Config,
  aliasConfig: AliasConfig | null,
  workspaceConfig: WorkspaceConfig | null,
  reporter: Reporter
): Promise<{ errors: number; scannedFiles: number; checkedImports: number }> {
  process.stdout.write('Scanning');
  
  const engine = new ScanEngine(config, absolutePath, aliasConfig, workspaceConfig);
  
  const scanResult = await engine.scan([absolutePath]);
  process.stdout.write('.');

  const parseResult = await engine.parseAndResolve(scanResult.files);
  process.stdout.write('.');

  const totalImports = parseResult.parsed.reduce((acc, file) => acc + file.imports.length, 0);
  
  reporter.setScannedFiles(scanResult.files.length);
  reporter.setCheckedImports(totalImports);
  
  for (const warning of parseResult.warnings) {
    const parts = warning.split(':');
    const file = parts[0]?.replace('Failed to parse ', '') ?? 'unknown';
    reporter.addWarning({ type: 'parse-error', file, message: parts.slice(1).join(':') });
  }

  reporter.addErrors(parseResult.errors);
  reporter.report();

  return {
    errors: reporter.getResult().errorCount,
    scannedFiles: scanResult.files.length,
    checkedImports: totalImports,
  };
}

export async function scanCommand(targetPath: string, options: ScanCommandOptions): Promise<void> {
  const absolutePath = path.resolve(targetPath);
  
  const exists = await fs.pathExists(absolutePath);
  if (!exists) {
    console.error(`Error: Path "${targetPath}" does not exist`);
    process.exit(2);
  }

  const stats = await fs.stat(absolutePath);
  if (!stats.isDirectory()) {
    console.error(`Error: Path "${targetPath}" is not a directory`);
    process.exit(2);
  }

  const config: Config = {
    ...getDefaultConfig(),
    include: options.include ? options.include.split(',') : getDefaultConfig().include,
    exclude: options.exclude ? options.exclude.split(',') : getDefaultConfig().exclude,
    watch: options.watch,
    verbose: options.verbose,
  };

  let aliasConfig = null;
  const tsConfigResult = await loadTsConfig(absolutePath);
  if (tsConfigResult.success && tsConfigResult.config) {
    aliasConfig = tsConfigResult.config;
    if (options.verbose) {
      console.log(`Loaded alias config: ${aliasConfig.paths.length} path mappings`);
    }
  }

  let workspaceConfig: WorkspaceConfig | null = null;
  const workspaceResult = await detectWorkspace(absolutePath);
  if (workspaceResult && workspaceResult.packages.length > 0) {
    workspaceConfig = workspaceResult;
    if (options.verbose) {
      console.log(`Detected ${workspaceResult.type} workspace with ${workspaceResult.packages.length} packages`);
    }
  }

  const outputFormat = options.json ? 'json' : options.format;
  
  if (options.watch) {
    await runWatchMode(absolutePath, config, aliasConfig, workspaceConfig, options, outputFormat);
    return;
  }

  const reporter = new Reporter({ verbose: options.verbose, format: outputFormat });
  
  try {
    const result = await runScan(absolutePath, config, aliasConfig, workspaceConfig, reporter);
    
    if (result.errors > 0) {
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(2);
  }
}

async function runWatchMode(
  absolutePath: string,
  config: Config,
  aliasConfig: AliasConfig | null,
  workspaceConfig: WorkspaceConfig | null,
  options: ScanCommandOptions,
  outputFormat: 'text' | 'json'
): Promise<void> {
  let watcher: FileWatcher | null = null;
  
  const startTime = () => {
    const now = new Date();
    return `[${now.toLocaleTimeString('en-US', { hour12: false })}]`;
  };

  console.log('\n' + '─'.repeat(50));
  console.log('Watch mode enabled. Watching for changes...');
  console.log('Press Ctrl+C to stop.\n');

  if (outputFormat === 'json') {
    console.log('{"success": false, "summary": {"filesScanned": 0, "importsChecked": 0, "errorsFound": 0}, "errors": [], "warnings": []}');
  }

  const runScanWithClear = async () => {
    if (options.clear) {
      console.clear();
      console.log('\n' + '─'.repeat(50));
    }
    
    const newReporter = new Reporter({ verbose: options.verbose, format: outputFormat });
    return runScan(absolutePath, config, aliasConfig, workspaceConfig, newReporter);
  };

  await runScanWithClear();

  const handleChanges = async (changes: FileChangeEvent[]) => {
    for (const change of changes) {
      console.log(`${startTime()} File ${change.type}: ${path.relative(absolutePath, change.path)}`);
    }
    
    await runScanWithClear();
  };

  try {
    watcher = await watchDirectory(
      absolutePath,
      handleChanges,
      (error) => console.error(`Watcher error: ${error.message}`)
    );

    await new Promise(() => {});
  } catch (error) {
    console.error(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    if (watcher) {
      await watcher.stop();
    }
  }
}

export function createCLI(): Command {
  const program = new Command();
  
  program
    .name('import-linter')
    .description('CLI tool to detect orphan imports in React/TypeScript/JavaScript projects')
    .version('1.0.0');

  program
    .command('scan <path>')
    .description('Scan a directory for orphan imports')
    .option('-i, --include <patterns>', 'Comma-separated glob patterns to include')
    .option('-e, --exclude <patterns>', 'Comma-separated glob patterns to exclude')
    .option('-w, --watch', 'Watch mode for continuous scanning', false)
    .option('-c, --clear', 'Clear console on each scan in watch mode', false)
    .option('-j, --json', 'Output in JSON format')
    .option('-v, --verbose', 'Verbose output', false)
    .option('-f, --format <format>', 'Output format (text|json)', 'text')
    .action(scanCommand);

  return program;
}

import { fileURLToPath } from 'node:url';

export function runCLI(args: string[]): void {
  const program = createCLI();
  program.parse(args);
}

const __filename = fileURLToPath(import.meta.url);
if (import.meta.url.startsWith('file://') && __filename === process.argv[1]) {
  runCLI(process.argv);
}