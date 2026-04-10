import { ResolvedImport } from '../types/index.js';
import { PathResolver, ModuleResolver, ResolutionResult, createResolver } from './resolver.js';

export { PathResolver, ModuleResolver, ResolutionResult, createResolver };

export class ImportResolver {
  private moduleResolver: ModuleResolver;

  constructor(rootPath: string) {
    this.moduleResolver = new ModuleResolver(rootPath);
  }

  async resolveImport(importPath: string, fromFile: string): Promise<ResolvedImport> {
    if (this.isExternalModule(importPath)) {
      return {
        originalSource: importPath,
        resolvedPath: null,
        exists: true,
        isExternal: true,
      };
    }

    const result = await this.moduleResolver.resolve(importPath, fromFile);
    
    return {
      originalSource: importPath,
      resolvedPath: result.resolvedPath ?? null,
      exists: result.exists,
      isExternal: false,
    };
  }

  private isExternalModule(source: string): boolean {
    return !source.startsWith('.') && !source.startsWith('/');
  }
}

export class ResolverEngine {
  private resolver: ImportResolver;

  constructor(rootPath: string) {
    this.resolver = new ImportResolver(rootPath);
  }

  async resolveImports(
    imports: Array<{ source: string; filePath: string }>
  ): Promise<Map<string, ResolvedImport>> {
    const results = new Map<string, ResolvedImport>();

    for (const imp of imports) {
      const resolved = await this.resolver.resolveImport(imp.source, imp.filePath);
      results.set(imp.source, resolved);
    }

    return results;
  }
}