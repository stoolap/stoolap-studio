/**
 * What Stoolap Desktop asks of the operating system, done in the browser:
 * confirmations and context menus as the app's own (shown by
 * components/common/native-host.tsx), notifications through the browser,
 * the server for its connections and the engine's version.
 */
import { rpc } from "./api-client";

// --- Confirmations ---

export interface ConfirmRequest {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
}

let showConfirm: ((r: ConfirmRequest) => void) | null = null;
export function setConfirmHost(host: typeof showConfirm) {
  showConfirm = host;
}

export async function showConfirmDialog(options: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
  const host = showConfirm;
  if (!host) return window.confirm(options.detail ? `${options.message}\n\n${options.detail}` : options.message);
  return new Promise((resolve) => host({ ...options, resolve }));
}

// --- Context menus ---

export interface MenuItem {
  id: string;
  label: string;
  type?: "separator" | "normal";
  enabled?: boolean;
}

export interface MenuRequest {
  items: MenuItem[];
  x: number;
  y: number;
  resolve: (id: string | null) => void;
}

let showMenu: ((r: MenuRequest) => void) | null = null;
export function setMenuHost(host: typeof showMenu) {
  showMenu = host;
}

/** Where the pointer was at the last right-click: where a menu opens */
let pointer = { x: 0, y: 0 };
if (typeof window !== "undefined") {
  window.addEventListener(
    "contextmenu",
    (e) => {
      pointer = { x: e.clientX, y: e.clientY };
    },
    true,
  );
}

/** A menu at the pointer; resolves to the chosen item's id, or null */
export async function showContextMenu(items: MenuItem[]): Promise<string | null> {
  const host = showMenu;
  if (!host) return null;
  return new Promise((resolve) => host({ items, ...pointer, resolve }));
}

// --- System ---

export async function getVersion(): Promise<string> {
  return process.env.NEXT_PUBLIC_APP_VERSION ?? "";
}

export async function getStoolapVersion(): Promise<string> {
  return rpc("get_stoolap_version");
}

export async function closeExample(): Promise<void> {
  await rpc("db_close_example");
}

export async function listConnections(): Promise<
  Array<{ id: string; name: string; path: string; type: "memory" | "file" }>
> {
  return rpc("db_list");
}

// --- Notifications ---

/** A browser notification while the page is in the background, when the
 *  browser allows them; the app never asks for the permission itself */
export async function notify(title: string, body?: string) {
  try {
    if (document.visibilityState === "visible" || Notification.permission !== "granted") return;
    new Notification(title, { body });
  } catch {
    // Not supported here
  }
}
