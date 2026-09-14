import { app, BrowserWindow, dialog, nativeTheme, shell } from "electron";
import { join } from "node:path";
import { openDatabase, closeDatabase, databasePath } from "./db/connection";
import { migrate } from "./db/migrations";
import { backupOnLaunch } from "./db/backup";
import {
  firstTimeInTray,
  keepsInTray,
  registerIpc,
  savedCaptureShortcut,
} from "./ipc";
import { heldShortcut, setCaptureShortcut } from "./capture";
import { shortcutToClaim } from "./popup";
import { createTray, destroyTray, hasTray, trayNotice } from "./tray";
import { claimIdentity, registerIdentity } from "./identity";

// Before anything can notify: a notification is signed with this ID, and
// without it Windows signs Caulder's reminders "electron.app.Electron".
claimIdentity();
import { startNotifications, stopNotifications } from "./services/notify";
import { startReminders, stopReminders } from "./services/remind";
import { startSyncing, stopSyncing } from "./services/scheduler";

const isDev = !app.isPackaged;

/**
 * Caulder holds one SQLite file. A second instance writing the same file is a
 * corruption risk, so the second launch hands focus to the first and exits.
 */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // exit, not quit. The hand-over to the running copy has already been sent
  // by the call above, and this copy has nothing to tidy away - but quit runs
  // every "will-quit" handler immediately, before the app is ready, and one
  // that threw left this copy alive behind an error dialog. Opening Caulder
  // from the Start menu while it sat in the tray left one behind every time.
  app.exit(0);
}

let mainWindow: BrowserWindow | null = null;
/** Set on the way out, so closing the window then really closes it. */
let quitting = false;

/** Test runs launch the app dozens of times; none of them should take focus. */
const background = () => process.env["CAULDER_BACKGROUND"] === "1";

/**
 * Brings the main window back - from the tray's "Open Caulder", from a second
 * launch, or from a notification - making it again if it was ever closed.
 */
function showMain(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (background()) mainWindow.showInactive();
  else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    // The size it restores to when un-maximised. It opens maximised.
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

  // Fills the work area on open - maximised, not full screen. This is a
  // workspace rather than a document: a windowed 1280px app on a wide monitor
  // spends most of its width on nothing.
  //
  // Maximised rather than sized to the display, so the title bar and the
  // window controls stay where they belong and one click restores it.
  mainWindow.once("ready-to-show", () => {
    mainWindow?.maximize();
    // showInactive when something else is driving. A test run launches and
    // closes the app dozens of times, and every one of those stealing focus
    // makes the machine unusable while the suite runs. The flag is set by
    // playwright.config.ts and by nothing a user ever does.
    if (background()) mainWindow?.showInactive();
    else mainWindow?.show();
  });

  // Closing the window leaves Caulder in the tray, the way Claude and most
  // tray apps do: the icon and the key are useless once the process is gone,
  // and so are the reminders. Quitting is the tray menu's job - or the whole
  // app's, when this is switched off in Settings.
  mainWindow.on("close", (event) => {
    if (quitting) return;
    if (!hasTray() || !keepsInTray()) {
      // Not kept in the tray, so closing the window is quitting - and said
      // outright. Left to "all windows closed", the hidden quick window
      // would keep the process alive with nothing on screen.
      app.quit();
      return;
    }
    event.preventDefault();
    mainWindow?.hide();
    // Said once, the first time: a window that vanishes with no word looks
    // like a crash. Not in a test run, which has no one to tell.
    if (firstTimeInTray() && !background()) {
      const key = heldShortcut();
      trayNotice(
        "Caulder is still here",
        `It is in the tray by the clock.${key ? ` ${key} adds a task from anywhere;` : ""} right-click the icon to quit.`,
      );
    }
  });

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

// Opening Caulder again - from the Start menu, say - while it waits in the
// tray brings the window back rather than doing nothing visible.
app.on("second-instance", () => showMain());

void app.whenReady().then(() => {
  // A second launch has already handed over and asked to quit - but Electron
  // still fires "ready" after a quit requested this early, and without this
  // line the second copy would back up and open the same database, and put a
  // second icon in the tray, on its way out.
  if (!gotLock) return;

  // The name and mark Windows puts on a notification, for a copy run without
  // the installer's shortcut to read them from.
  registerIdentity();

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

  // The icon by the clock. Before the key, so the menu can show the key it
  // ends up with.
  createTray({ open: showMain, quit: () => app.quit() });

  // The quick-add key: Ctrl+Alt+A unless somebody chose another, or none. A
  // refusal is not shown here - another application may have claimed the
  // combination since last launch, and a dialog before the window has even
  // appeared is the wrong moment. Settings and the tray say what it got.
  setCaptureShortcut(shortcutToClaim(savedCaptureShortcut()));

  // Checked on a timer rather than scheduled, because the machine sleeps and
  // a scheduled 9am fires at noon on a laptop that was shut. The check itself
  // is one count per company and is a no-op unless it is switched on.
  startNotifications(() => mainWindow);

  // And the one that knocks before a block starts. A finer tick than the
  // digest above, because ten to nine has to mean ten to nine; it reads
  // nothing at all for a workspace that has not switched reminders on.
  startReminders(() => mainWindow);

  // Off unless it has been switched on, and quiet for the first few seconds
  // either way - the window has just opened and nobody wants a network call
  // competing with it.
  startSyncing();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Windows and Linux quit with the last window.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  quitting = true;
  stopNotifications();
  stopReminders();
  stopSyncing();
});

// WAL leaves a sidecar file; closing cleanly checkpoints it back into the
// database so a backup taken next launch is a complete one.
app.on("will-quit", () => {
  // Left behind, a tray icon lingers in the notification area until the
  // pointer passes over it and Windows notices the process has gone.
  destroyTray();
  closeDatabase();
});
