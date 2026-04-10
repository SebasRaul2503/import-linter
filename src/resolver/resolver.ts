import path from 'node:path';
import fs from 'fs-extra';
import { AliasConfig, PathMapping } from '../config/tsconfig-loader.js';
import { WorkspaceConfig, WorkspacePackage } from '../config/workspace-loader.js';

export type ErrorType = 'missing-file' | 'case-mismatch';

export interface ResolutionResult {
  exists: boolean;
  resolvedPath?: string;
  errorType?: ErrorType;
  isAlias?: boolean;
  isWorkspacePackage?: boolean;
}

const SUPPORTED_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.mtsx',
  '.mjs',
  '.mjsx',
];

const INDEX_FILES = [
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'index.mts',
  'index.mtsx',
  'index.mjs',
  'index.mjsx',
];

export class PathResolver {
  private aliasConfig: AliasConfig | null;
  private pathMappings: PathMapping[];
  private workspacePackages: Map<string, WorkspacePackage>;

  constructor(_rootPath: string, aliasConfig: AliasConfig | null = null, workspaceConfig: WorkspaceConfig | null = null) {
    this.aliasConfig = aliasConfig;
    this.pathMappings = aliasConfig?.paths ?? [];
    this.workspacePackages = new Map();
    
    if (workspaceConfig) {
      for (const pkg of workspaceConfig.packages) {
        this.workspacePackages.set(pkg.name, pkg);
      }
    }
  }

  setAliasConfig(config: AliasConfig | null): void {
    this.aliasConfig = config;
    this.pathMappings = config?.paths ?? [];
  }

  setWorkspaceConfig(config: WorkspaceConfig | null): void {
    this.workspacePackages.clear();
    
    if (config) {
      for (const pkg of config.packages) {
        this.workspacePackages.set(pkg.name, pkg);
      }
    }
  }

  async resolve(importPath: string, fromFile: string): Promise<ResolutionResult> {
    if (this.aliasConfig && this.isAliasImport(importPath)) {
      const aliasResult = await this.resolveAlias(importPath, fromFile);
      if (aliasResult) {
        return aliasResult;
      }
    }

    if (this.isWorkspacePackageImport(importPath)) {
      const workspaceResult = await this.resolveWorkspacePackage(importPath);
      if (workspaceResult) {
        return workspaceResult;
      }
      return {
        exists: false,
        errorType: 'missing-file',
        isWorkspacePackage: true,
      };
    }

    if (this.isExternalModule(importPath)) {
      return { exists: true };
    }

    return this.resolveRelative(importPath, fromFile);
  }

  private isWorkspacePackageImport(importPath: string): boolean {
    return importPath.startsWith('@') && importPath.includes('/') && !this.isAliasImport(importPath);
  }

  private async resolveWorkspacePackage(importPath: string): Promise<ResolutionResult | null> {
    const parts = importPath.split('/');
    const packageName = parts.slice(0, 2).join('/');
    const subPath = parts.slice(2).join('/');
    
    const workspacePackage = this.workspacePackages.get(packageName);
    
    if (!workspacePackage) {
      return null;
    }

    const packageRoot = path.resolve(workspacePackage.rootPath, workspacePackage.location);
    let resolvedPath = packageRoot;

    if (subPath) {
      resolvedPath = path.join(packageRoot, subPath);
    } else {
      resolvedPath = await this.resolvePackageEntry(packageRoot);
    }

    const checkResult = await this.checkPathExists(resolvedPath);
    if (checkResult.exists) {
      return {
        ...checkResult,
        isWorkspacePackage: true,
      };
    }

    return {
      exists: false,
      errorType: 'missing-file',
      isWorkspacePackage: true,
    };
  }

  private async resolvePackageEntry(packageRoot: string): Promise<string> {
    const packageJsonPath = path.join(packageRoot, 'package.json');
    
    try {
      const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      if (pkg.exports) {
        if (typeof pkg.exports === 'string') {
          return path.join(packageRoot, pkg.exports);
        }
        if (pkg.exports['.']) {
          return path.join(packageRoot, pkg.exports['.']);
        }
        if (pkg.exports['./']) {
          const entry = pkg.exports['./'];
          if (typeof entry === 'string') {
            return path.join(packageRoot, entry);
          }
          if (entry.import) {
            return path.join(packageRoot, entry.import);
          }
        }
      }
      
      if (pkg.main) {
        return path.join(packageRoot, pkg.main);
      }
      
      if (pkg.module) {
        return path.join(packageRoot, pkg.module);
      }
    } catch {
      // ignore
    }

    return path.join(packageRoot, 'src', 'index');
  }

  private isAliasImport(importPath: string): boolean {
    for (const mapping of this.pathMappings) {
      const prefix = mapping.pattern.replace('/*', '');
      if (importPath.startsWith(prefix + '/') || importPath === prefix) {
        return true;
      }
    }
    return false;
  }

  private async resolveAlias(importPath: string, _fromFile: string): Promise<ResolutionResult | null> {
    for (const mapping of this.pathMappings) {
      const prefix = mapping.pattern.replace('/*', '');
      
      if (!importPath.startsWith(prefix) && importPath !== prefix) {
        continue;
      }

      const remainder = importPath.slice(prefix.length).replace(/^\//, '');

      for (const target of mapping.targets) {
        let resolvedPath: string;

        if (mapping.isWildcard) {
          resolvedPath = target.replace('*', remainder);
        } else {
          resolvedPath = path.resolve(this.aliasConfig!.baseUrl, target);
        }

        resolvedPath = path.normalize(resolvedPath);

        const result = await this.checkPathExists(resolvedPath);
        if (result.exists) {
          return result;
        }
      }
    }

    return {
      exists: false,
      errorType: 'missing-file',
      isAlias: true,
    };
  }

  private async resolveRelative(importPath: string, fromFile: string): Promise<ResolutionResult> {
    const basePath = path.resolve(path.dirname(fromFile), importPath);

    const withExtensions = await this.tryExtensions(basePath);
    if (withExtensions && withExtensions.exists) {
      return withExtensions;
    }

    const noExtPath = basePath.replace(/\.(js|jsx|mjs|mjsx|ts|tsx|mts|mtsx)$/i, '');
    if (noExtPath !== basePath) {
      const withNoExt = await this.tryExtensions(noExtPath);
      if (withNoExt && withNoExt.exists) {
        return withNoExt;
      }

      const withIndex = await this.tryIndexFiles(noExtPath);
      if (withIndex && withIndex.exists) {
        return withIndex;
      }
    }

    const withIndex = await this.tryIndexFiles(basePath);
    if (withIndex && withIndex.exists) {
      return withIndex;
    }

    const caseMismatch = await this.detectCaseMismatch(noExtPath);
    if (caseMismatch) {
      return {
        exists: false,
        errorType: 'case-mismatch',
        resolvedPath: caseMismatch,
      };
    }

    return {
      exists: false,
      errorType: 'missing-file',
    };
  }

  private isExternalModule(source: string): boolean {
    return !source.startsWith('.') && !source.startsWith('/');
  }

  private async checkPathExists(checkPath: string): Promise<ResolutionResult> {
    const extResult = await this.tryExtensions(checkPath);
    if (extResult && extResult.exists) {
      return extResult;
    }

    const noExtPath = checkPath.replace(/\.(js|jsx|mjs|mjsx|ts|tsx|mts|mtsx)$/i, '');
    if (noExtPath !== checkPath) {
      const noExtResult = await this.tryExtensions(noExtPath);
      if (noExtResult && noExtResult.exists) {
        return noExtResult;
      }

      const indexResult = await this.tryIndexFiles(noExtPath);
      if (indexResult && indexResult.exists) {
        return indexResult;
      }
    }

    const indexResult = await this.tryIndexFiles(checkPath);
    if (indexResult && indexResult.exists) {
      return indexResult;
    }

    const caseMismatch = await this.detectCaseMismatch(noExtPath);
    if (caseMismatch) {
      return {
        exists: false,
        errorType: 'case-mismatch',
        resolvedPath: caseMismatch,
      };
    }

    return { exists: false, errorType: 'missing-file' };
  }

  private async tryExtensions(basePath: string): Promise<ResolutionResult | null> {
    for (const ext of SUPPORTED_EXTENSIONS) {
      const fullPath = basePath + ext;
      if (await this.fileExists(fullPath)) {
        return { exists: true, resolvedPath: fullPath };
      }
    }
    return { exists: false };
  }

  private async tryIndexFiles(dirPath: string): Promise<ResolutionResult | null> {
    if (!await this.isDirectory(dirPath)) {
      return null;
    }

    for (const indexFile of INDEX_FILES) {
      const fullPath = path.join(dirPath, indexFile);
      if (await this.fileExists(fullPath)) {
        return { exists: true, resolvedPath: fullPath };
      }
    }

    return { exists: false };
  }

  private async detectCaseMismatch(basePath: string): Promise<string | null> {
    const dir = path.dirname(basePath);
    const basename = path.basename(basePath);
    
    if (!(await this.isDirectory(dir))) {
      return null;
    }

    try {
      const files = await fs.readdir(dir);
      const found = files.find(f => f.toLowerCase() === basename.toLowerCase());
      
      if (found && found !== basename) {
        return path.join(dir, found);
      }
    } catch {
      return null;
    }

    for (const ext of SUPPORTED_EXTENSIONS) {
      const extBasePath = basePath + ext;
      const extDir = path.dirname(extBasePath);
      const extBasename = path.basename(extBasePath);
      
      try {
        const files = await fs.readdir(extDir);
        const found = files.find(f => f.toLowerCase() === extBasename.toLowerCase());
        
        if (found && found !== extBasename) {
          return path.join(extDir, found);
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  private async isDirectory(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}

export class ModuleResolver {
  private resolvers: Map<string, PathResolver>;

  constructor(rootPath: string, aliasConfig: AliasConfig | null = null) {
    this.resolvers = new Map();
    this.resolvers.set('default', new PathResolver(rootPath, aliasConfig));
  }

  setAliasConfig(config: AliasConfig | null): void {
    const resolver = this.resolvers.get('default');
    if (resolver) {
      resolver.setAliasConfig(config);
    }
  }

  async resolve(importPath: string, fromFile: string): Promise<ResolutionResult> {
    const resolver = this.resolvers.get('default')!;
    return resolver.resolve(importPath, fromFile);
  }

  async resolveMultiple(imports: Array<{ path: string; from: string }>): Promise<Map<string, ResolutionResult>> {
    const results = new Map<string, ResolutionResult>();
    
    for (const imp of imports) {
      const result = await this.resolve(imp.path, imp.from);
      results.set(imp.path, result);
    }

    return results;
  }
}

export async function createResolver(rootPath: string, aliasConfig: AliasConfig | null = null): Promise<ModuleResolver> {
  return new ModuleResolver(rootPath, aliasConfig);
}

export async function resolvePath(
  importPath: string,
  fromFile: string,
  rootPath: string,
  aliasConfig: AliasConfig | null = null
): Promise<ResolutionResult> {
  const resolver = new PathResolver(rootPath, aliasConfig);
  return resolver.resolve(importPath, fromFile);
}