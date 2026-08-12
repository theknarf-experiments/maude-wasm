export interface MaudeModuleOptions {
  noInitialRun?: boolean;
  arguments?: string[];
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  /** Called per character read from stdin; return a char code, or null for EOF. */
  stdin?: () => number | null;
  locateFile?: (file: string) => string;
  preRun?: Array<(module: MaudeModule) => void>;
}

export interface MaudeModule {
  ENV: Record<string, string>;
  FS: {
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string, opts?: { encoding: "utf8" }): string;
    mkdir(path: string): void;
  };
  callMain(args: string[]): number;
}

declare function createMaudeModule(
  options?: MaudeModuleOptions,
): Promise<MaudeModule>;

export default createMaudeModule;
