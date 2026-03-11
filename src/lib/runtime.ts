export interface DesktopRuntime {
  platform: string;
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
}

export interface RuntimeInfo {
  isDesktopApp: boolean;
  hasDesktopBridge: boolean;
  runtime?: DesktopRuntime;
}

export function getRuntimeInfo(win: Window | undefined): RuntimeInfo {
  if (!win) {
    return {
      isDesktopApp: false,
      hasDesktopBridge: false,
    };
  }

  const hasDesktopBridge = Boolean(win.desktop);
  const isDesktopUserAgent = /\bElectron\/\S+/i.test(win.navigator.userAgent);

  return {
    isDesktopApp: hasDesktopBridge || isDesktopUserAgent,
    hasDesktopBridge,
    runtime: win.desktop?.runtime,
  };
}
