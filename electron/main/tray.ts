import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from "electron";
import { heldShortcut, onShortcutChange, openCapture, toggleCapture } from "./capture";
import { brandFile } from "./identity";
import { trayItems, trayTooltip } from "./popup";

/**
 * Caulder's icon by the clock.
 *
 * Click it and the quick window opens beside it, ready for a task. Right-click
 * for the rest: a note, the app itself, and quitting - which is the only way
 * to, once closing the window leaves Caulder here rather than ending it.
 *
 * What the menu says and where the window goes are decided in popup.ts; this
 * only carries it out.
 */

let tray: Tray | null = null;

export function createTray(actions: { open: () => void; quit: () => void }): void {
  if (tray) return;
  // tray.png and its @Nx siblings, which Electron picks between by the
  // screen's scale.
  tray = new Tray(nativeImage.createFromPath(brandFile("tray.png")));

  const run = (action: "task" | "note" | "open" | "quit") => {
    if (action === "open") actions.open();
    else if (action === "quit") actions.quit();
    else openCapture({ mode: action, anchor: tray?.getBounds() });
  };

  const refresh = () => {
    if (!tray) return;
    const shortcut = heldShortcut();
    tray.setToolTip(trayTooltip(shortcut));
    const template: MenuItemConstructorOptions[] = trayItems(shortcut).map((item) =>
      "separator" in item
        ? { type: "separator" }
        : {
            label: item.label,
            // Shown, not registered: the key is already global, and a menu
            // accelerator would only fight it for the same combination.
            ...(item.accelerator ? { accelerator: item.accelerator, registerAccelerator: false } : {}),
            click: () => run(item.action),
          },
    );
    tray.setContextMenu(Menu.buildFromTemplate(template));
  };

  tray.on("click", () => {
    if (tray) toggleCapture(tray.getBounds());
  });

  onShortcutChange(refresh);
  refresh();

  // The one thing a test cannot reach any other way is the icon itself: there
  // is no pointer to click the notification area with. Only ever set when the
  // suite launched the app - see playwright.config.ts.
  if (process.env["CAULDER_BACKGROUND"] === "1") {
    (globalThis as { __caulderTray?: Tray }).__caulderTray = tray;
  }
}

export function hasTray(): boolean {
  return tray !== null;
}

/** A one-off word from the icon: where Caulder went when its window closed. */
export function trayNotice(title: string, content: string): void {
  tray?.displayBalloon({ title, content, iconType: "info" });
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
