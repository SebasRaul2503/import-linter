import { Project, SyntaxKind } from 'ts-morph';
import path from 'node:path';
import fs from 'fs-extra';

export type ExportErrorType = 'missing-export' | 'missing-default' | 'missing-namespace';

export interface ExportValidationResult {
  isValid: boolean;
  missingExports: string[];
  availableExports: string[];
  hasDefaultExport: boolean;
  hasNamespaceExport: boolean;
}

export interface ExportError {
  importPath: string;
  filePath: string;
  missingExport: string;
  errorType: ExportErrorType;
  availableExports: string[];
}

export class ExportValidator {
  private project: Project;
  private cache: Map<string, ExportValidationResult>;

  constructor() {
    this.project = new Project({
      compilerOptions: {
        target: 99,
        module: 99,
        allowJs: true,
        checkJs: true,
        noEmit: true,
        skipLibCheck: true,
      },
    });
    this.cache = new Map();
  }

  async validate(
    filePath: string,
    importPath: string,
    specifiers: Array<{ name: string; isDefault: boolean; isNamespace: boolean }>
  ): Promise<ExportError[]> {
    const errors: ExportError[] = [];
    const resolvedPath = await this.resolveImportPath(filePath, importPath);
    
    if (!resolvedPath) {
      return errors;
    }

    const exports = await this.getExports(resolvedPath);

    for (const spec of specifiers) {
      if (spec.isDefault) {
        if (!exports.hasDefaultExport) {
          errors.push({
            importPath,
            filePath: path.basename(filePath),
            missingExport: spec.name,
            errorType: 'missing-default',
            availableExports: exports.availableExports,
          });
        }
      } else if (spec.isNamespace) {
        if (!exports.hasNamespaceExport) {
          errors.push({
            importPath,
            filePath: path.basename(filePath),
            missingExport: spec.name,
            errorType: 'missing-namespace',
            availableExports: exports.availableExports,
          });
        }
      } else {
        if (!exports.availableExports.includes(spec.name)) {
          errors.push({
            importPath,
            filePath: path.basename(filePath),
            missingExport: spec.name,
            errorType: 'missing-export',
            availableExports: exports.availableExports,
          });
        }
      }
    }

    return errors;
  }

  private async resolveImportPath(fromFile: string, importPath: string): Promise<string | null> {
    const dir = path.dirname(fromFile);
    const basePath = path.resolve(dir, importPath);
    
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mtsx', '.mjs', '.mjsx'];
    
    for (const ext of extensions) {
      const fullPath = basePath + ext;
      if (await fs.pathExists(fullPath)) {
        return fullPath;
      }
    }

    for (const ext of extensions) {
      const indexPath = path.join(basePath, 'index' + ext);
      if (await fs.pathExists(indexPath)) {
        return indexPath;
      }
    }

    return null;
  }

  private async getExports(filePath: string): Promise<ExportValidationResult> {
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }

    const result: ExportValidationResult = {
      isValid: true,
      missingExports: [],
      availableExports: [],
      hasDefaultExport: false,
      hasNamespaceExport: false,
    };

    try {
      const sourceFile = this.project.addSourceFileAtPath(filePath);
      
      result.availableExports = this.extractAllExports(sourceFile);
      result.hasDefaultExport = this.hasDefaultExport(sourceFile);
      result.hasNamespaceExport = this.hasNamespaceExport(sourceFile);
      result.isValid = result.availableExports.length > 0 || result.hasDefaultExport;
      
      this.cache.set(filePath, result);
    } catch {
      result.isValid = false;
    }

    return result;
  }

  private extractAllExports(sourceFile: import('ts-morph').SourceFile): string[] {
    const exports = new Set<string>();

    const exportDeclarations = sourceFile.getExportDeclarations();
    for (const exportDecl of exportDeclarations) {
      const structure = exportDecl.getStructure();
      
      if (structure.moduleSpecifier) {
        const exportPath = structure.moduleSpecifier.toString().replace(/['"]/g, '');
        const barrelExports = this.resolveBarrelExport(exportPath, sourceFile);
        barrelExports.forEach(e => exports.add(e));
      }

      if ('namedExports' in structure && Array.isArray(structure.namedExports)) {
        for (const exp of structure.namedExports) {
          if (typeof exp === 'object' && 'name' in exp) {
            exports.add(exp.name);
          }
        }
      }
    }

    const variableStatements = sourceFile.getDescendantsOfKind(SyntaxKind.VariableStatement);
    for (const stmt of variableStatements) {
      if (stmt.hasExportKeyword()) {
        for (const decl of stmt.getDeclarations()) {
          const name = decl.getName();
          if (typeof name === 'string') {
            exports.add(name);
          }
        }
      }
    }

    const functionDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
    for (const func of functionDeclarations) {
      if (func.hasExportKeyword()) {
        const name = func.getName();
        if (name) {
          exports.add(name);
        }
      }
    }

    const classDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration);
    for (const cls of classDeclarations) {
      if (cls.hasExportKeyword()) {
        const name = cls.getName();
        if (name) {
          exports.add(name);
        }
      }
    }

    const interfaceDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration);
    for (const iface of interfaceDeclarations) {
      if (iface.hasExportKeyword()) {
        exports.add(iface.getName());
      }
    }

    const typeAliases = sourceFile.getDescendantsOfKind(SyntaxKind.TypeAliasDeclaration);
    for (const type of typeAliases) {
      if (type.hasExportKeyword()) {
        exports.add(type.getName());
      }
    }

    const enumDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.EnumDeclaration);
    for (const enumDecl of enumDeclarations) {
      if (enumDecl.hasExportKeyword()) {
        exports.add(enumDecl.getName());
      }
    }

    return Array.from(exports);
  }

  private resolveBarrelExport(exportPath: string, sourceFile: import('ts-morph').SourceFile): string[] {
    const fileDir = path.dirname(sourceFile.getFilePath());
    const resolvedPath = path.resolve(fileDir, exportPath);

    const cached = this.cache.get(resolvedPath);
    if (cached) {
      return cached.availableExports;
    }

    return [];
  }

  private hasDefaultExport(sourceFile: import('ts-morph').SourceFile): boolean {
    const defaultExports = sourceFile.getDescendantsOfKind(SyntaxKind.DefaultKeyword);
    return defaultExports.length > 0;
  }

  private hasNamespaceExport(sourceFile: import('ts-morph').SourceFile): boolean {
    const namespaceDecls = sourceFile.getDescendantsOfKind(SyntaxKind.ModuleDeclaration);
    return namespaceDecls.some(ns => ns.hasExportKeyword());
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export function createExportValidator(): ExportValidator {
  return new ExportValidator();
}

export async function validateExports(
  filePath: string,
  importPath: string,
  specifiers: Array<{ name: string; isDefault: boolean; isNamespace: boolean }>
): Promise<ExportError[]> {
  const validator = new ExportValidator();
  return validator.validate(filePath, importPath, specifiers);
}