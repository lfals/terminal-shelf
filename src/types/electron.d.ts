declare global {
  interface Window {
    desktop?: {
      runtime: {
        platform: string;
        versions: {
          chrome: string;
          electron: string;
          node: string;
        };
      };
      openExternal: (url: string) => Promise<void>;
    };
  }
}

export {};
