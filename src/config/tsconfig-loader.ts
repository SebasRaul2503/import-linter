import path from 'node:path';
import fs from 'fs-extra';

export interface PathMapping {
  pattern: string;
  targets: string[];
  isWildcard: boolean;
}

export interface TsConfig {
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AliasConfig {
  baseUrl: string;
  paths: PathMapping[];
}

export interface ConfigLoadResult {
  success: boolean;
  config?: AliasConfig;
  error?: string;
}

const PATH_MAPPING_REGEX = /^([^/*]+)\/\*$/;

function parsePathPattern(pattern: string): { prefix: string; isWildcard: boolean } {
  const wildcardMatch = pattern.match(PATH_MAPPING_REGEX);
  
  if (wildcardMatch && wildcardMatch[1]) {
    return {
      prefix: wildcardMatch[1],
      isWildcard: true,
    };
  }
  
  return {
    prefix: pattern,
    isWildcard: false,
  };
}

function createPathMapping(pattern: string, targets: string[]): PathMapping {
  const { isWildcard } = parsePathPattern(pattern);
  
  return {
    pattern,
    targets,
    isWildcard,
  };
}

export class TsConfigLoader {
  private loadedConfig: AliasConfig | null = null;
  private configPath: string | null = null;

  async load(rootPath: string): Promise<ConfigLoadResult> {
    if (this.loadedConfig && this.configPath === rootPath) {
      return { success: true, config: this.loadedConfig };
    }

    const tsconfigPath = path.join(rootPath, 'tsconfig.json');
    const jsconfigPath = path.join(rootPath, 'jsconfig.json');

    let config: TsConfig | null = null;

    if (await this.fileExists(tsconfigPath)) {
      config = await this.loadConfigFile(tsconfigPath);
    } else if (await this.fileExists(jsconfigPath)) {
      config = await this.loadConfigFile(jsconfigPath);
    }

    if (!config) {
      return { success: false, error: 'No tsconfig.json or jsconfig.json found' };
    }

    const aliasConfig = this.parseConfig(config, rootPath);
    
    this.loadedConfig = aliasConfig;
    this.configPath = rootPath;

    if (aliasConfig) {
      return { success: true, config: aliasConfig };
    }
    
    return { success: false, error: 'No path mappings found in config' };
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  private async loadConfigFile(configPath: string): Promise<TsConfig | null> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content) as TsConfig;
    } catch {
      return null;
    }
  }

  private parseConfig(config: TsConfig, rootPath: string): AliasConfig | null {
    const compilerOptions = config.compilerOptions;
    
    if (!compilerOptions || !compilerOptions.paths) {
      return null;
    }

    const baseUrl = compilerOptions.baseUrl
      ? path.resolve(rootPath, compilerOptions.baseUrl)
      : rootPath;

    const paths: PathMapping[] = [];
    
    for (const [pattern, targets] of Object.entries(compilerOptions.paths)) {
      if (pattern.includes('*') && !PATH_MAPPING_REGEX.test(pattern)) {
        continue;
      }

      const normalizedTargets = targets.map(target => {
        if (target.includes('*')) {
          return target;
        }
        return path.resolve(baseUrl, target);
      });

      paths.push(createPathMapping(pattern, normalizedTargets));
    }

    if (paths.length === 0) {
      return null;
    }

    return { baseUrl, paths };
  }

  getConfig(): AliasConfig | null {
    return this.loadedConfig;
  }

  reset(): void {
    this.loadedConfig = null;
    this.configPath = null;
  }
}

export async function loadTsConfig(rootPath: string): Promise<ConfigLoadResult> {
  const loader = new TsConfigLoader();
  return loader.load(rootPath);
}

export function createAliasConfig(
  paths: Record<string, string[]>,
  baseUrl: string
): AliasConfig {
  const mappings = Object.entries(paths).map(([pattern, targets]) =>
    createPathMapping(pattern, targets)
  );

  return {
    baseUrl,
    paths: mappings,
  };
}