import { app, BrowserWindow, dialog, nativeTheme, shell } from "electron";
import { join } from "node:path";
import { openDatabase, closeDatabase, databasePath } from "./db/connection";
import { migrate } from "./db/migrations";
import { backupOnLaunch } from "./db/backup";
import { registerIpc } from "./ipc";

const isDev = !app.isPackaged;

/**
 * Caulder holds one SQLite file. A second instance writing the same file is a
 * corruption risk, so the second launch hands focus to the first and exits.
 */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    show: false,
    frame: false,
    // Paints behind the renderer during startup, before any CSS exists. Both
    // values are --bg from tokens.css. Hardcoding the light one meant a dark
    // user got a pale flash on every launch, from the window itself rather
    // than from anything the renderer could fix.
    //
    // This follows the OS, which is right for the default "match system" and
    // for anyone whose explicit choice agrees with it. An explicit choice
    // against the OS is the one case still unaccounted for, and it cannot be
    // read here: the choice lives in the renderer's localStorage.
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1a1c21" : "#e8ecf3",
    // Dev only. A packaged build takes its window and taskbar icon from the
    // executable, which electron-builder stamps from the same resources/icon.png;
    // pointing at a path inside the asar here would just fail to load.
    ...(isDev ? { icon: join(app.getAppPath(), "resources", "icon.png") } : {}),
    webPreferences: {
      // .mjs, not .js: package.json is "type": "module", so electron-vite
      // emits the preload as ESM. Electron loads an ESM preload only when the
      // extension says so and the sandbox is off. Pointing at ".js" here fails
      // silently - the bridge never loads and window.caulder is undefined.
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Show only once painted, so the window never appears empty.
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Anything trying to open a new window goes to the real browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const devServer = process.env["ELECTRON_RENDERER_URL"];
  if (isDev && devServer) {
    void mainWindow.loadURL(devServer);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

/**
 * Back up, then migrate, then open. The order matters: the backup is the only
 * way back from a migration that goes wrong on the user's single copy.
 *
 * A failure here is fatal and says so plainly, rather than opening a window
 * onto a database that is not there. Everything else in the app assumes the
 * schema is current.
 */
function startDatabase(): void {
  const backup = backupOnLaunch();
  if (backup.kind === "skipped" && backup.reason !== "no database yet") {
    console.warn(`Backup skipped: ${backup.reason}`);
  }

  const db = openDatabase();
  const result = migrate(db);
  if (result.applied.length > 0) {
    console.warn(`Database migrated ${result.from} -> ${result.to}`);
  }
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

void app.whenReady().then(() => {
  try {
    startDatabase();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox(
      "Caulder cannot open its database",
      `${detail}\n\nThe file is at:\n${databasePath()}\n\n` +
        "A copy from before this launch is in the backups folder beside it.",
    );
    app.exit(1);
    return;
  }

  registerIpc(() => mainWindow);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Windows and Linux quit with the last window. Caulder is single-window, so
// there is nothing to keep alive.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// WAL leaves a sidecar file; closing cleanly checkpoints it back into the
// database so a backup taken next launch is a complete one.
app.on("will-quit", () => closeDatabase());
