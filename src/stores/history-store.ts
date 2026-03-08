import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ConnectionHistoryEntry {
  path: string;
  name: string;
  type: "memory" | "file";
  lastUsed: number;
}

interface HistoryState {
  recentConnections: ConnectionHistoryEntry[];
  addRecent: (entry: Omit<ConnectionHistoryEntry, "lastUsed">) => void;
  removeRecent: (path: string) => void;
  clearHistory: () => void;
}

const MAX_HISTORY = 10;

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      recentConnections: [],

      addRecent: (entry) =>
        set((s) => {
          const filtered = s.recentConnections.filter(
            (e) => e.path !== entry.path,
          );
          return {
            recentConnections: [
              { ...entry, lastUsed: Date.now() },
              ...filtered,
            ].slice(0, MAX_HISTORY),
          };
        }),

      removeRecent: (path) =>
        set((s) => ({
          recentConnections: s.recentConnections.filter((e) => e.path !== path),
        })),

      clearHistory: () => set({ recentConnections: [] }),
    }),
    { name: "stoolap-history", version: 1 },
  ),
);
