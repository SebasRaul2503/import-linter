import fg from 'fast-glob';
import path from 'node:path';
import { Config } from '../config/index.js';
import { TypeScriptParser } from '../parser/parser.js';
import { ParsedFile } from '../types/index.js';
import { PathResolver } from '../resolver/resolver.js';
import { ImportError } from '../reporter/reporter.js';
import { AliasConfig } from '../config/tsconfig-loader.js';
import { WorkspaceConfig } from '../config/workspace-loader.js';
import { ExportValidator, ExportError as ValidatorExportError } from '../validator/index.js';

export interface ScanResult {
  files: string[];
  directories: string[];
  errors: ScanError[];
}

export interface ScanError {
  code: string;
  message: string;
  path?: string;
}

export interface ParsedFileWithPath extends ParsedFile {
  relativePath: string;
}

const DEFAULT_IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/coverage/**',
  '**/.cache/**',
];

const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mtsx', '.mjs', '.mjsx'];

export class Scanner {
  private ignores: string[];

  constructor(config: Config) {
    this.ignores = [...DEFAULT_IGNORES, ...config.exclude];
  }

  async scan(targetPath: string): Promise<ScanResult> {
    const errors: ScanError[] = [];
    
    try {
      const absolutePath = path.resolve(targetPath);
      const files = await this.scanFiles(absolutePath);
      
      return {
        files,
        directories: [],
        errors,
      };
    } catch (error) {
      errors.push({
        code: 'SCAN_ERROR',
        message: error instanceof Error ? error.message : 'Unknown scan error',
        path: targetPath,
      });
      
      return {
        files: [],
        directories: [],
        errors,
      };
    }
  }

  private async scanFiles(absolutePath: string): Promise<string[]> {
    const patterns = this.buildPatterns(absolutePath);
    
    const files = await fg(patterns, {
      absolute: true,
      onlyFiles: true,
      ignore: this.ignores,
    });

    return this.filterByExtension(files);
  }

  private buildPatterns(targetPath: string): string[] {
    return SUPPORTED_EXTENSIONS.map(ext => `${targetPath}/**/*${ext}`);
  }

  private filterByExtension(files: string[]): string[] {
    return files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return SUPPORTED_EXTENSIONS.includes(ext as typeof SUPPORTED_EXTENSIONS[number]);
    });
  }
}

export class FileScanner {
  private scanner: Scanner;
  private parser: TypeScriptParser;
  private rootPath: string;
  private aliasConfig: AliasConfig | null;
  private workspaceConfig: WorkspaceConfig | null;
  private exportValidator: ExportValidator;

  constructor(config: Config, rootPath: string, aliasConfig: AliasConfig | null = null, workspaceConfig: WorkspaceConfig | null = null) {
    this.scanner = new Scanner(config);
    this.parser = new TypeScriptParser();
    this.rootPath = rootPath;
    this.aliasConfig = aliasConfig;
    this.workspaceConfig = workspaceConfig;
    this.exportValidator = new ExportValidator();
  }

  setAliasConfig(config: AliasConfig | null): void {
    this.aliasConfig = config;
  }

  setWorkspaceConfig(config: WorkspaceConfig | null): void {
    this.workspaceConfig = config;
  }

  async scanPaths(paths: string[]): Promise<string[]> {
    const files: string[] = [];
    
    for (const targetPath of paths) {
      const result = await this.scanner.scan(targetPath);
      files.push(...result.files);
    }

    return files;
  }

  async parseFilesWithWarnings(filePaths: string[]): Promise<{ parsed: ParsedFileWithPath[]; warnings: string[] }> {
    const parsedFiles: ParsedFileWithPath[] = [];
    const warnings: string[] = [];
    
    for (const filePath of filePaths) {
      try {
        const parsed = this.parser.parseFile(filePath);
        const relativePath = path.relative(this.rootPath, filePath);
        parsedFiles.push({
          ...parsed,
          relativePath,
        });
      } catch (error) {
        warnings.push(`Failed to parse ${path.basename(filePath)}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { parsed: parsedFiles, warnings };
  }

  async resolveImports(parsedFiles: ParsedFileWithPath[]): Promise<ImportError[]> {
    const errors: ImportError[] = [];
    const resolver = new PathResolver(this.rootPath, this.aliasConfig, this.workspaceConfig);

    for (const file of parsedFiles) {
      for (const importStmt of file.imports) {
        if (this.isResolvable(importStmt.source)) {
          const result = await resolver.resolve(importStmt.source, file.absolutePath);
          
          if (!result.exists) {
            const error: ImportError = {
              file: file.relativePath,
              line: importStmt.startLine,
              column: 1,
              importPath: importStmt.source,
              errorType: result.errorType ?? 'missing-file',
            };
            if (result.resolvedPath) {
              error.resolvedAttempt = result.resolvedPath;
            }
            errors.push(error);
          } else {
            const exportErrors = await this.validateExports(
              file.absolutePath,
              importStmt
            );
            for (const expError of exportErrors) {
              const error: ImportError = {
                file: file.relativePath,
                line: importStmt.startLine,
                column: 1,
                importPath: importStmt.source,
                errorType: 'missing-export',
              };
              if (expError.availableExports.length > 0) {
                error.resolvedAttempt = `Available exports: ${expError.availableExports.join(', ')}`;
              }
              errors.push(error);
            }
          }
        }
      }
    }

    return errors;
  }

  private async validateExports(
    filePath: string,
    importStmt: import('../types/index.js').ImportStatement
  ): Promise<ValidatorExportError[]> {
    if (importStmt.isDynamic) {
      return [];
    }

    const specifiers = importStmt.specifiers.map(spec => ({
      name: spec.name,
      isDefault: spec.isDefault,
      isNamespace: spec.isNamespace,
    }));

    return this.exportValidator.validate(filePath, importStmt.source, specifiers);
  }

  private isRelativeOrAbsolute(source: string): boolean {
    return source.startsWith('.') || source.startsWith('/');
  }

  private isResolvable(source: string): boolean {
    if (this.isRelativeOrAbsolute(source)) {
      return true;
    }
    if (this.aliasConfig) {
      for (const mapping of this.aliasConfig.paths) {
        const prefix = mapping.pattern.replace('/*', '');
        if (source.startsWith(prefix)) {
          return true;
        }
      }
    }
    if (this.workspaceConfig) {
      if (source.startsWith('@')) {
        return true;
      }
    }
    return false;
  }

  async parseFiles(filePaths: string[]): Promise<ParsedFile[]> {
    const parsedFiles: ParsedFile[] = [];
    
    for (const filePath of filePaths) {
      try {
        const parsed = this.parser.parseFile(filePath);
        parsedFiles.push(parsed);
      } catch {
        parsedFiles.push({
          filePath: path.basename(filePath),
          absolutePath: filePath,
          imports: [],
          exports: [],
        });
      }
    }

    return parsedFiles;
  }
}

export class ScanEngine {
  private scanner: Scanner;
  private fileScanner: FileScanner;

  constructor(config: Config, rootPath: string, aliasConfig: AliasConfig | null = null, workspaceConfig: WorkspaceConfig | null = null) {
    this.scanner = new Scanner(config);
    this.fileScanner = new FileScanner(config, rootPath, aliasConfig, workspaceConfig);
  }

  async scan(paths: string[]): Promise<{ files: string[]; warnings: string[] }> {
    const allFiles: string[] = [];
    const allWarnings: string[] = [];

    for (const targetPath of paths) {
      const result = await this.scanner.scan(targetPath);
      allFiles.push(...result.files);

      for (const err of result.errors) {
        allWarnings.push(`Scan error in ${err.path ?? targetPath}: ${err.message}`);
      }
    }

    return { files: allFiles, warnings: allWarnings };
  }

  async parseFiles(filePaths: string[]): Promise<ParsedFile[]> {
    return this.fileScanner.parseFiles(filePaths);
  }

  async parseAndResolve(filePaths: string[]): Promise<{ parsed: ParsedFileWithPath[]; errors: ImportError[]; warnings: string[] }> {
    const parseResult = await this.fileScanner.parseFilesWithWarnings(filePaths);
    const errors = await this.fileScanner.resolveImports(parseResult.parsed);
    
    return {
      parsed: parseResult.parsed,
      errors,
      warnings: parseResult.warnings,
    };
  }
}