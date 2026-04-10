import { describe, it, expect } from 'vitest';
import { createCLI } from '../src/cli/index.js';

describe('CLI', () => {
  it('should create CLI with scan command', () => {
    const cli = createCLI();
    expect(cli.commands.find(c => c.name() === 'scan')).toBeDefined();
  });

  it('should have correct version', () => {
    const cli = createCLI();
    expect(cli.version()).toBe('1.0.0');
  });
});