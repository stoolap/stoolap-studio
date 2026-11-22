import { create } from "zustand";
import { persist } from "zustand/middleware";
import i18n from "@/lib/i18n";

/** Choices for the engine's query timeout; 0 turns it off. */
export const QUERY_TIMEOUT_OPTIONS = [
  { ms: 30_000, unit: "seconds", count: 30 },
  { ms: 60_000, unit: "minutes", count: 1 },
  { ms: 300_000, unit: "minutes", count: 5 },
  { ms: 900_000, unit: "minutes", count: 15 },
  { ms: 3_600_000, unit: "hours", count: 1 },
  { ms: 0, unit: "off", count: 0 },
] as const;

/** The option's label in the app's language */
export function queryTimeoutLabel(ms: number): string {
  const o = QUERY_TIMEOUT_OPTIONS.find((o) => o.ms === ms) ?? { unit: "seconds", count: ms / 1000 };
  return i18n.t(`editor:timeout.${o.unit}`, { count: o.count });
}

interface SettingsState {
  /** Matches DEFAULT_QUERY_TIMEOUT_MS in src-tauri/src/db.rs */
  queryTimeoutMs: number;
  setQueryTimeoutMs: (ms: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      queryTimeoutMs: 300_000,
      setQueryTimeoutMs: (ms) => set({ queryTimeoutMs: ms }),
    }),
    { name: "stoolap-settings" },
  ),
);
