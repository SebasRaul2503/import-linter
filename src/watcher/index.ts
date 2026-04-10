import chokidar, { FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';

export interface WatchOptions {
  paths: string[];
  ignorePatterns: string[];
  extensions: string[];
  debounceMs: number;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  timestamp: number;
}

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private options: WatchOptions;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingChanges: Map<string, FileChangeEvent> = new Map();
  private isRunning = false;

  constructor(options: Partial<WatchOptions> = {}) {
    super();
    this.options = {
      paths: [],
      ignorePatterns: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/.next/**',
        '**/.nuxt/**',
        '**/coverage/**',
        '**/.cache/**',
      ],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mtsx', '.mjs', '.mjsx'],
      debounceMs: 100,
      ...options,
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const patterns = this.buildPatterns();
    
    this.watcher = chokidar.watch(patterns, {
      ignored: this.options.ignorePatterns,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher
      .on('add', (filePath) => this.handleChange('add', filePath))
      .on('change', (filePath) => this.handleChange('change', filePath))
      .on('unlink', (filePath) => this.handleChange('unlink', filePath))
      .on('error', (error) => this.emit('error', error));

    this.isRunning = true;
  }

  private buildPatterns(): string[] {
    const patterns: string[] = [];
    
    for (const basePath of this.options.paths) {
      for (const ext of this.options.extensions) {
        patterns.push(`${basePath}/**/*${ext}`);
      }
    }

    return patterns;
  }

  private handleChange(type: 'add' | 'change' | 'unlink', filePath: string): void {
    const event: FileChangeEvent = {
      type,
      path: filePath,
      timestamp: Date.now(),
    };

    this.pendingChanges.set(filePath, event);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushChanges();
    }, this.options.debounceMs);
  }

  private flushChanges(): void {
    if (this.pendingChanges.size === 0) {
      return;
    }

    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();

    this.emit('change', changes);
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.isRunning = false;
    this.pendingChanges.clear();
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getWatchedFiles(): string[] {
    if (!this.watcher) {
      return [];
    }
    return Object.keys(this.watcher.getWatched());
  }
}

export function createWatcher(options?: Partial<WatchOptions>): FileWatcher {
  return new FileWatcher(options);
}

export async function watchDirectory(
  targetPath: string,
  onChange: (changes: FileChangeEvent[]) => void,
  onError?: (error: Error) => void
): Promise<FileWatcher> {
  const watcher = new FileWatcher({
    paths: [targetPath],
    debounceMs: 150,
  });

  watcher.on('change', onChange);
  
  if (onError) {
    watcher.on('error', onError);
  }

  await watcher.start();
  
  return watcher;
}