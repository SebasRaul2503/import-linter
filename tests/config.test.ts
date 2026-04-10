import { describe, it, expect } from 'vitest';
import { getDefaultConfig, mergeConfig } from '../src/config/index.js';

describe('Config', () => {
  it('should return default config', () => {
    const config = getDefaultConfig();
    expect(config.include).toBeDefined();
    expect(config.exclude).toBeDefined();
    expect(config.extensions).toHaveLength(4);
  });

  it('should merge config correctly', () => {
    const base = getDefaultConfig();
    const merged = mergeConfig(base, { verbose: true, watch: true });
    expect(merged.verbose).toBe(true);
    expect(merged.watch).toBe(true);
    expect(merged.include).toBe(base.include);
  });
});