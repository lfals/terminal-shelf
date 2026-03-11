import { app, BrowserWindow, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const isSafeExternalUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#0a0f1e",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();

    if (url !== currentUrl) {
      event.preventDefault();
    }
  });

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
    return mainWindow;
  }

  const rendererHtml = join(__dirname, "..", "out", "index.html");

  if (!existsSync(rendererHtml)) {
    throw new Error(
      `Renderer export not found at ${rendererHtml}. Run "bun run build" before starting Electron.`
    );
  }

  void mainWindow.loadFile(rendererHtml);

  return mainWindow;
}

app.whenReady().then(() => {
  ipcMain.handle("desktop:open-external", async (_event, url: string) => {
    if (!isSafeExternalUrl(url)) {
      throw new Error("Blocked unsafe external URL.");
    }

    await shell.openExternal(url);
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
