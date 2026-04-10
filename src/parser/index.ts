import { ParsedFile, ImportStatement } from '../types/index.js';
import { TypeScriptParser, JavaScriptParser, parseFile } from './parser.js';

export { TypeScriptParser, JavaScriptParser, parseFile };

export interface ParserOptions {
  preserveWhitespace: boolean;
}

export class FileParser {
  private tsParser: TypeScriptParser;
  private jsParser: JavaScriptParser;

  constructor(_options?: ParserOptions) {
    this.tsParser = new TypeScriptParser();
    this.jsParser = new JavaScriptParser();
  }

  async parseFile(filePath: string): Promise<ParsedFile> {
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    
    if (ext === '.ts' || ext === '.tsx' || ext === '.mts' || ext === '.mtsx') {
      return this.tsParser.parseFile(filePath);
    }
    
    return this.jsParser.parseFile(filePath);
  }

  parseContent(_content: string, _filePath: string): ParsedFile {
    throw new Error('Not implemented');
  }

  extractImports(_content: string): ImportStatement[] {
    throw new Error('Not implemented');
  }
}

export class ParserRegistry {
  private parsers: Map<string, FileParser>;

  constructor() {
    this.parsers = new Map();
  }

  register(extension: string, parser: FileParser): void {
    this.parsers.set(extension, parser);
  }

  getParser(filePath: string): FileParser | null {
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    return this.parsers.get(ext) ?? null;
  }
}