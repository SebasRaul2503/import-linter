export interface ImportStatement {
  source: string;
  startLine: number;
  endLine: number;
  isDynamic: boolean;
  specifiers: ImportSpecifier[];
}

export interface ImportSpecifier {
  name: string;
  alias?: string;
  isDefault: boolean;
  isNamespace: boolean;
}

export interface ParsedFile {
  filePath: string;
  absolutePath: string;
  imports: ImportStatement[];
  exports: string[];
}

export interface FileAnalysis {
  file: ParsedFile;
  orphanImports: ImportStatement[];
  errors: ValidationError[];
}

export interface ValidationError {
  code: ErrorCode;
  message: string;
  filePath: string;
  line?: number;
  importSource?: string;
}

export type ErrorCode =
  | 'ORPHAN_IMPORT'
  | 'UNRESOLVED_IMPORT'
  | 'INVALID_PATH'
  | 'FILE_NOT_FOUND'
  | 'PARSE_ERROR';

export interface LintResult {
  isValid: boolean;
  errors: ValidationError[];
  scannedFiles: number;
  totalImports: number;
  orphanCount: number;
}

export interface ScanOptions {
  paths: string[];
  includePatterns: string[];
  excludePatterns: string[];
  watchMode: boolean;
  verbose: boolean;
}

export interface ResolvedImport {
  originalSource: string;
  resolvedPath: string | null;
  exists: boolean;
  isExternal: boolean;
}

export interface ProjectContext {
  rootPath: string;
  packageJsonPath: string | null;
  tsConfigPath: string | null;
  files: ParsedFile[];
}