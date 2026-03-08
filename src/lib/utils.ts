import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export { quoteId } from "./sql-utils";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Returns true if running on macOS (client-side only). */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  // @ts-expect-error -- userAgentData is not yet in all TS lib typings
  const uaData = navigator.userAgentData as { platform?: string } | undefined;
  if (uaData?.platform) return uaData.platform === "macOS";
  return navigator.userAgent?.includes("Mac") ?? false;
}

/** Returns the modifier key label for the current platform (Cmd or Ctrl). */
export function modKey(): string {
  return isMac() ? "\u2318" : "Ctrl";
}

/** Download a string as a file in the browser. */
export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/** Escape a value for CSV output. */
export function escapeCSV(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}
