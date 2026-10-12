interface SentryCliLike {
  execute(args: string[], live: boolean): Promise<unknown>;
}

export declare function shouldUploadSourceMaps(env?: NodeJS.ProcessEnv): boolean;
export declare function uploadSourceMaps(
  directory: string,
  env?: NodeJS.ProcessEnv,
  createCli?: (options: Record<string, string>) => SentryCliLike,
): Promise<boolean>;
