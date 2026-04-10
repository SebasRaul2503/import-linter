import chalk from 'chalk';

export type ImportErrorType = 'missing-file' | 'case-mismatch' | 'missing-export';

export interface ImportError {
  file: string;
  line: number;
  column: number;
  importPath: string;
  errorType: ImportErrorType;
  resolvedAttempt?: string;
}

export interface Warning {
  type: 'parse-error' | 'scan-error';
  file: string;
  message: string;
}

export interface ReporterResult {
  scannedFiles: number;
  checkedImports: number;
  orphanImports: number;
  errors: ImportError[];
  warnings: Warning[];
  success: boolean;
  errorCount: number;
}

export type OutputFormat = 'text' | 'json';

export interface ReporterConfig {
  verbose: boolean;
  format: OutputFormat;
  color: boolean;
}

export interface JsonReport {
  success: boolean;
  summary: {
    filesScanned: number;
    importsChecked: number;
    errorsFound: number;
  };
  errors: JsonError[];
  warnings: JsonWarning[];
}

export interface JsonError {
  file: string;
  line: number;
  column: number;
  importPath: string;
  errorType: ImportErrorType;
  message: string;
}

export interface JsonWarning {
  type: string;
  file: string;
  message: string;
}

export class Reporter {
  private config: ReporterConfig;
  private errors: ImportError[] = [];
  private warnings: Warning[] = [];
  private scannedFilesCount = 0;
  private checkedImportsCount = 0;

  constructor(config?: Partial<ReporterConfig>) {
    this.config = {
      verbose: false,
      format: 'text',
      color: true,
      ...config,
    };
  }

  setScannedFiles(count: number): void {
    this.scannedFilesCount = count;
  }

  setCheckedImports(count: number): void {
    this.checkedImportsCount = count;
  }

  addError(error: ImportError): void {
    this.errors.push(error);
  }

  addErrors(errors: ImportError[]): void {
    this.errors.push(...errors);
  }

  addWarning(warning: Warning): void {
    this.warnings.push(warning);
  }

  getResult(): ReporterResult {
    return {
      scannedFiles: this.scannedFilesCount,
      checkedImports: this.checkedImportsCount,
      orphanImports: this.errors.length,
      errors: [...this.errors],
      warnings: [...this.warnings],
      success: this.errors.length === 0,
      errorCount: this.errors.length,
    };
  }

  report(): void {
    if (this.config.format === 'json') {
      this.reportJson();
      return;
    }

    this.reportHuman();
  }

  private reportJson(): void {
    const jsonReport = this.buildJsonReport();
    console.log(JSON.stringify(jsonReport, null, 2));
  }

  private reportHuman(): void {
    console.log('\n' + chalk.bold('Import Linter'));
    console.log(chalk.gray('─'.repeat(40)));
    this.printWarnings();
    this.printErrors();
    this.printSummary();
  }

  private printWarnings(): void {
    if (this.warnings.length === 0 || !this.config.verbose) {
      return;
    }

    console.log('\n' + chalk.yellow('Warnings:'));
    for (const warning of this.warnings) {
      console.log(`  ${chalk.yellow('⚠')} ${warning.file}`);
      console.log(`    ${chalk.gray(warning.message)}`);
    }
  }

  private printErrors(): void {
    if (this.errors.length === 0) {
      return;
    }

    console.log('\n' + chalk.bold.red('Errors:'));
    for (const error of this.errors) {
      this.printError(error);
    }
  }

  private printError(error: ImportError): void {
    console.log(`\n  ${chalk.red('❌')} ${error.file}:${error.line}:${error.column}`);

    if (error.errorType === 'missing-file') {
      console.log(`    ${chalk.red('Missing import:')} ${chalk.cyan(error.importPath)}`);
      console.log(`    ${chalk.gray('Reason: file does not exist')}`);
    } else if (error.errorType === 'case-mismatch') {
      console.log(`    ${chalk.red('Import casing mismatch:')} ${chalk.cyan(error.importPath)}`);
      console.log(`    ${chalk.gray('Actual file:')} ${chalk.cyan(error.resolvedAttempt ?? 'unknown')}`);
    } else if (error.errorType === 'missing-export') {
      console.log(`    ${chalk.red('Missing export from:')} ${chalk.cyan(error.importPath)}`);
      if (error.resolvedAttempt && error.resolvedAttempt.startsWith('Available exports:')) {
        console.log(`    ${chalk.gray(error.resolvedAttempt)}`);
      }
    }
  }

  private printSummary(): void {
    console.log('\n' + chalk.gray('─'.repeat(40)));
    console.log(`Scanned ${chalk.cyan(this.scannedFilesCount.toString())} files`);
    console.log(`Checked ${chalk.cyan(this.checkedImportsCount.toString())} imports`);
    console.log(
      `Found ${this.errors.length > 0 ? chalk.red(this.errors.length.toString()) : chalk.green('0')} orphan imports`
    );

    console.log(chalk.gray('─'.repeat(40)));

    if (this.errors.length === 0) {
      console.log(chalk.green('✅ No orphan imports found.'));
    } else {
      console.log(chalk.red(`❌ Found ${this.errors.length} orphan import(s).`));
    }
    console.log('');
  }

  buildJsonReport(): JsonReport {
    const errors: JsonError[] = this.errors.map(error => {
      let message = '';
      
      switch (error.errorType) {
        case 'missing-file':
          message = 'File does not exist';
          break;
        case 'case-mismatch':
          message = `Actual file: ${error.resolvedAttempt ?? 'unknown'}`;
          break;
        case 'missing-export':
          message = error.resolvedAttempt 
            ? `Available exports: ${error.resolvedAttempt}`
            : 'Export not found';
          break;
      }

      return {
        file: error.file,
        line: error.line,
        column: error.column,
        importPath: error.importPath,
        errorType: error.errorType,
        message,
      };
    });

    const warnings: JsonWarning[] = this.warnings.map(warning => ({
      type: warning.type,
      file: warning.file,
      message: warning.message,
    }));

    return {
      success: this.errors.length === 0,
      summary: {
        filesScanned: this.scannedFilesCount,
        importsChecked: this.checkedImportsCount,
        errorsFound: this.errors.length,
      },
      errors,
      warnings,
    };
  }

  clear(): void {
    this.errors = [];
    this.warnings = [];
    this.scannedFilesCount = 0;
    this.checkedImportsCount = 0;
  }
}

export function createReporter(config?: Partial<ReporterConfig>): Reporter {
  return new Reporter(config);
}

export function formatError(error: ImportError): string {
  const location = `${error.file}:${error.line}:${error.column}`;
  
  if (error.errorType === 'missing-file') {
    return `Missing import: ${error.importPath} at ${location}`;
  }
  
  return `Import casing mismatch: ${error.importPath} at ${location} (actual: ${error.resolvedAttempt})`;
}