import { Project, SyntaxKind, Node } from 'ts-morph';
import path from 'node:path';
import { ParsedFile, ImportStatement, ImportSpecifier } from '../types/index.js';

export interface ImportRecord {
  sourceFile: string;
  importPath: string;
  line: number;
  column: number;
  isDynamic: boolean;
  specifiers: ImportSpecifier[];
}

export interface ParserError {
  code: string;
  message: string;
  filePath: string;
  line?: number;
}

export class TypeScriptParser {
  private project: Project | null = null;

  parseFile(filePath: string): ParsedFile {
    try {
      this.initProject();

      const sourceFile = this.project!.addSourceFileAtPath(filePath);
      const imports = this.extractImports(sourceFile);
      const exports = this.extractExports(sourceFile);

      return {
        filePath: path.basename(filePath),
        absolutePath: filePath,
        imports,
        exports,
      };
    } catch {
      return {
        filePath: path.basename(filePath),
        absolutePath: filePath,
        imports: [],
        exports: [],
      };
    }
  }

  private initProject(): void {
    if (!this.project) {
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
    }
  }

  private extractImports(sourceFile: import('ts-morph').SourceFile): ImportStatement[] {
    const imports: ImportStatement[] = [];

    const importDeclarations = sourceFile.getImportDeclarations();
    for (const importDecl of importDeclarations) {
      const importPath = importDecl.getModuleSpecifierValue();
      const startLine = importDecl.getStartLineNumber();
      const endLine = importDecl.getEndLineNumber();

      const specifiers: ImportSpecifier[] = [];
      const importClause = importDecl.getImportClause();
      
      if (importClause) {
        const defaultImport = importClause.getDefaultImport();
        if (defaultImport && defaultImport.getText()) {
          specifiers.push({
            name: defaultImport.getText(),
            isDefault: true,
            isNamespace: false,
          });
        }

        const namedImports = importClause.getNamedImports();
        for (const named of namedImports) {
          const aliasNode = named.getNameNode();
          const aliasStr = aliasNode.getChildCount() > 1 ? aliasNode.getLastChild()?.getText() : undefined;
          const specifier: ImportSpecifier = {
            name: named.getName(),
            isDefault: false,
            isNamespace: false,
          };
          if (aliasStr) {
            specifier.alias = aliasStr;
          }
          specifiers.push(specifier);
        }

        const namespaceImport = importClause.getNamespaceImport();
        if (namespaceImport && namespaceImport.getText()) {
          specifiers.push({
            name: namespaceImport.getText(),
            isDefault: false,
            isNamespace: true,
          });
        }
      }

      imports.push({
        source: importPath,
        startLine,
        endLine,
        isDynamic: false,
        specifiers,
      });
    }

    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of callExpressions) {
      const expression = call.getExpression();
      if (expression.getText() === 'import') {
        const args = call.getArguments();
        if (args.length > 0) {
          const firstArg = args[0];
          if (Node.isStringLiteral(firstArg)) {
            const importPath = firstArg.getText().replace(/['"]/g, '');
            const startLine = firstArg.getStartLineNumber();

            imports.push({
              source: importPath,
              startLine,
              endLine: startLine,
              isDynamic: true,
              specifiers: [],
            });
          }
        }
      }
    }

    return imports;
  }

  private extractExports(sourceFile: import('ts-morph').SourceFile): string[] {
    const exports: string[] = [];

    const exportDeclarations = sourceFile.getExportDeclarations();
    for (const exportDecl of exportDeclarations) {
      if (exportDecl.hasModuleSpecifier()) {
        continue;
      }
      const structure = exportDecl.getStructure();
      if ('namedExports' in structure && Array.isArray(structure.namedExports)) {
        for (const exp of structure.namedExports as Array<{ name: string }>) {
          exports.push(exp.name);
        }
      }
    }

    const namedExports = sourceFile.getDescendantsOfKind(SyntaxKind.ExportSpecifier);
    for (const exportSpec of namedExports) {
      exports.push(exportSpec.getName());
    }

    return [...new Set(exports)];
  }
}

export class JavaScriptParser {
  parseFile(filePath: string): ParsedFile {
    return new TypeScriptParser().parseFile(filePath);
  }
}

export function createParser(_filePath: string): TypeScriptParser {
  return new TypeScriptParser();
}

export function parseFile(filePath: string): ParsedFile {
  const parser = new TypeScriptParser();
  return parser.parseFile(filePath);
}