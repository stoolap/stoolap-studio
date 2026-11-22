import { useEffect, useState, type ComponentType } from "react";
import { initI18n } from "@/lib/i18n";

// What Stoolap Desktop's main.tsx does before the app's first frame, for the
// browser: the platform, the theme, and the translations.

// Thin overlay scrollbars on a Mac, as its own (globals.css)
if (navigator.platform.includes("Mac")) document.documentElement.dataset.platform = "mac";

// No browser menu (Back, Reload, Inspect…) on a right-click: the app shows
// its own where it has one. Text fields keep theirs, for copy and paste.
document.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement | null;
  if (target?.closest("input, textarea, [contenteditable], .cm-editor, .allow-select")) return;
  e.preventDefault();
});

// Follow the system's dark and light mode
function applySystemTheme() {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
}
applySystemTheme();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applySystemTheme);

// The app loads once the translations have, so its stores and first frame
// are already in the user's language
const ready = initI18n()
  .catch(() => {})
  .then(() => import("./App"));

export function Studio() {
  const [App, setApp] = useState<ComponentType | null>(null);
  useEffect(() => {
    ready.then((m) => setApp(() => m.default));
  }, []);
  return App ? <App /> : null;
}
