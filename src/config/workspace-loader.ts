import path from 'node:path';
import fs from 'fs-extra';

export type WorkspaceType = 'pnpm' | 'nx' | 'turbo' | 'npm' | 'yarn' | 'unknown';

export interface WorkspacePackage {
  name: string;
  location: string;
  rootPath: string;
}

export interface WorkspaceConfig {
  type: WorkspaceType;
  rootPath: string;
  packages: WorkspacePackage[];
}

export interface PackageJson {
  name?: string;
  main?: string;
  module?: string;
  exports?: string | Record<string, string | { import?: string; require?: string }>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export class WorkspaceLoader {
  private workspaceConfig: WorkspaceConfig | null = null;
  private cache = new Map<string, WorkspacePackage>();

  async detectAndLoad(rootPath: string): Promise<WorkspaceConfig | null> {
    if (this.workspaceConfig && this.workspaceConfig.rootPath === rootPath) {
      return this.workspaceConfig;
    }

    const workspaceType = await this.detectWorkspaceType(rootPath);
    
    if (workspaceType === 'unknown') {
      return null;
    }

    const packages = await this.loadPackages(rootPath, workspaceType);
    
    this.workspaceConfig = {
      type: workspaceType,
      rootPath,
      packages,
    };

    for (const pkg of packages) {
      this.cache.set(pkg.name, pkg);
    }

    return this.workspaceConfig;
  }

  private async detectWorkspaceType(rootPath: string): Promise<WorkspaceType> {
    const pnpmWorkspace = path.join(rootPath, 'pnpm-workspace.yaml');
    if (await this.fileExists(pnpmWorkspace)) {
      return 'pnpm';
    }

    const turboJson = path.join(rootPath, 'turbo.json');
    if (await this.fileExists(turboJson)) {
      return 'turbo';
    }

    const nxJson = path.join(rootPath, 'nx.json');
    if (await this.fileExists(nxJson)) {
      return 'nx';
    }

    const packageJsonPath = path.join(rootPath, 'package.json');
    if (await this.fileExists(packageJsonPath)) {
      const pkg = await this.readJson<{ workspaces?: { packages?: string[]; names?: string[] }; private?: boolean }>(packageJsonPath);
      if (pkg && (pkg.workspaces?.packages || pkg.workspaces?.names)) {
        return 'npm';
      }
      if (pkg && pkg.private === true && pkg.workspaces) {
        const workspaces = pkg.workspaces as string[] | undefined;
        if (workspaces && workspaces.length > 0) {
          return 'yarn';
        }
      }
    }

    return 'unknown';
  }

  private async loadPackages(rootPath: string, type: WorkspaceType): Promise<WorkspacePackage[]> {
    const packages: WorkspacePackage[] = [];

    switch (type) {
      case 'pnpm':
        await this.loadPnpmPackages(rootPath, packages);
        break;
      case 'npm':
      case 'yarn':
        await this.loadNpmWorkspaces(rootPath, packages);
        break;
      case 'nx':
        await this.loadNxPackages(rootPath, packages);
        break;
      case 'turbo':
        await this.loadTurboPackages(rootPath, packages);
        break;
    }

    return packages;
  }

  private async loadPnpmPackages(rootPath: string, packages: WorkspacePackage[]): Promise<void> {
    const workspaceYamlPath = path.join(rootPath, 'pnpm-workspace.yaml');
    
    try {
      const content = await fs.readFile(workspaceYamlPath, 'utf-8');
      const packagesPatterns = this.parsePnpmWorkspace(content);
      
      for (const pattern of packagesPatterns) {
        const resolvedPattern = path.resolve(rootPath, pattern.replace('*', ''));
        const dirs = await this.findDirectories(resolvedPattern);
        
        for (const dir of dirs) {
          const pkgJson = await this.readPackageJson(dir);
          if (pkgJson?.name) {
            packages.push({
              name: pkgJson.name,
              location: path.relative(rootPath, dir),
              rootPath: rootPath,
            });
          }
        }
      }
    } catch {
      // fallback to default
    }
  }

  private parsePnpmWorkspace(content: string): string[] {
    const packagesMatch = content.match(/packages:\s*\[([^\]]+)\]/);
    if (!packagesMatch || !packagesMatch[1]) {
      return ['packages/*', 'apps/*'];
    }
    
    const items = packagesMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
    return items.length > 0 ? items : ['packages/*'];
  }

  private async loadNpmWorkspaces(rootPath: string, packages: WorkspacePackage[]): Promise<void> {
    const rootPackageJson = await this.readJson<PackageJson>(path.join(rootPath, 'package.json'));
    const workspaces = rootPackageJson?.workspaces as { packages?: string[] } | string[] | undefined;
    
    let patterns: string[] = [];
    
    if (workspaces && typeof workspaces === 'object' && 'packages' in workspaces) {
      patterns = (workspaces as { packages: string[] }).packages;
    } else if (Array.isArray(workspaces)) {
      patterns = workspaces;
    } else {
      patterns = ['packages/*', 'apps/*'];
    }

    for (const pattern of patterns) {
      const resolvedPattern = path.resolve(rootPath, pattern.replace('*', ''));
      const dirs = await this.findDirectories(resolvedPattern);
      
      for (const dir of dirs) {
        const pkgJson = await this.readPackageJson(dir);
        if (pkgJson?.name) {
          packages.push({
            name: pkgJson.name,
            location: path.relative(rootPath, dir),
            rootPath: rootPath,
          });
        }
      }
    }
  }

  private async loadNxPackages(rootPath: string, packages: WorkspacePackage[]): Promise<void> {
    const nxJson = await this.readJson<{ projects?: Record<string, string> }>(path.join(rootPath, 'nx.json'));
    
    if (nxJson?.projects) {
      for (const [_name, location] of Object.entries(nxJson.projects)) {
        const dir = path.resolve(rootPath, location);
        const pkgJson = await this.readPackageJson(dir);
        if (pkgJson?.name) {
          packages.push({
            name: pkgJson.name,
            location: path.relative(rootPath, dir),
            rootPath: rootPath,
          });
        }
      }
    }
  }

  private async loadTurboPackages(rootPath: string, packages: WorkspacePackage[]): Promise<void> {
    await this.readJson<{ pipeline?: Record<string, unknown>; tasks?: Record<string, unknown> }>(path.join(rootPath, 'turbo.json'));
    const rootPackageJson = await this.readJson<PackageJson>(path.join(rootPath, 'package.json'));
    
    const workspacePackages = rootPackageJson?.workspaces as string[] | undefined;
    const patterns = workspacePackages || ['apps/*', 'packages/*'];
    
    for (const pattern of patterns) {
      const resolvedPattern = path.resolve(rootPath, pattern.replace('*', ''));
      const dirs = await this.findDirectories(resolvedPattern);
      
      for (const dir of dirs) {
        const pkgJson = await this.readPackageJson(dir);
        if (pkgJson?.name) {
          packages.push({
            name: pkgJson.name,
            location: path.relative(rootPath, dir),
            rootPath: rootPath,
          });
        }
      }
    }
  }

  private async findDirectories(dirPattern: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dirPattern, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory())
        .map(e => path.join(dirPattern, e.name));
    } catch {
      return [];
    }
  }

  private async readPackageJson(dir: string): Promise<PackageJson | null> {
    return this.readJson<PackageJson>(path.join(dir, 'package.json'));
  }

  private async readJson<T>(filePath: string): Promise<T | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  resolvePackage(packageName: string): WorkspacePackage | null {
    if (this.workspaceConfig) {
      return this.workspaceConfig.packages.find(p => p.name === packageName) ?? null;
    }
    return this.cache.get(packageName) ?? null;
  }

  getConfig(): WorkspaceConfig | null {
    return this.workspaceConfig;
  }

  clearCache(): void {
    this.cache.clear();
    this.workspaceConfig = null;
  }
}

export async function detectWorkspace(rootPath: string): Promise<WorkspaceConfig | null> {
  const loader = new WorkspaceLoader();
  return loader.detectAndLoad(rootPath);
}

export function createWorkspaceLoader(): WorkspaceLoader {
  return new WorkspaceLoader();
}