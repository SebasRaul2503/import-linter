import fg from 'fast-glob';
import path from 'node:path';
import { Config } from '../config/index.js';

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

export function createScanner(config: Config): Scanner {
  return new Scanner(config);
}