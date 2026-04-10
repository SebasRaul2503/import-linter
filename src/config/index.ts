import path from 'node:path';
import fs from 'fs-extra';

export interface Config {
  include: string[];
  exclude: string[];
  extensions: string[];
  watch: boolean;
  verbose: boolean;
}

export interface ConfigOptions {
  include?: string[];
  exclude?: string[];
  extensions?: string[];
  watch?: boolean;
  verbose?: boolean;
}

const DEFAULT_CONFIG: Config = {
  include: ['**/*.{ts,tsx,js,jsx}'],
  exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  watch: false,
  verbose: false,
};

export function getDefaultConfig(): Config {
  return { ...DEFAULT_CONFIG };
}

export async function loadConfig(configPath?: string): Promise<Config> {
  if (!configPath) {
    return getDefaultConfig();
  }

  const exists = await fs.pathExists(configPath);
  if (!exists) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = await fs.readJson(configPath);
  return mergeConfig(DEFAULT_CONFIG, content);
}

export function mergeConfig(base: Config, overrides: Partial<ConfigOptions>): Config {
  return {
    ...base,
    ...overrides,
    include: overrides.include ?? base.include,
    exclude: overrides.exclude ?? base.exclude,
    extensions: overrides.extensions ?? base.extensions,
  };
}

export function resolveConfigPath(configPath: string, rootPath: string): string {
  if (path.isAbsolute(configPath)) {
    return configPath;
  }
  return path.resolve(rootPath, configPath);
}