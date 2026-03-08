import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { ApiResult, EditorTab } from "@/lib/types";

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  queryHistory: string[];
  _tabCounter: number;
  addTab: (title?: string, sql?: string) => string;
  addDataTab: (
    tableName: string,
    initialFilter?: { column: string; value: string },
  ) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabSql: (id: string, sql: string) => void;
  updateTabTitle: (id: string, title: string) => void;
  setTabResult: (id: string, result: ApiResult | null) => void;
  setTabRunning: (id: string, running: boolean) => void;
  setTabLastExecutedSql: (id: string, sql: string) => void;
  addToHistory: (sql: string) => void;
}

const makeTab = (title?: string, sql?: string): EditorTab => ({
  id: uuidv4(),
  title: title ?? "Query",
  sql: sql ?? "",
  result: null,
  isRunning: false,
  mode: "query",
});

const initialTab = makeTab("Query 1");

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      tabs: [initialTab],
      activeTabId: initialTab.id,
      queryHistory: [],
      _tabCounter: 1,

      addTab: (title, sql) => {
        let tabId = "";
        set((s) => {
          const counter = s._tabCounter + 1;
          const tab = makeTab(title ?? `Query ${counter}`, sql);
          tabId = tab.id;
          return {
            _tabCounter: counter,
            tabs: [...s.tabs, tab],
            activeTabId: tab.id,
          };
        });
        return tabId;
      },

      addDataTab: (tableName, initialFilter) => {
        // Reuse existing data tab for same table (only when no filter)
        if (!initialFilter) {
          const existing = get().tabs.find(
            (t) => t.mode === "data" && t.tableName === tableName,
          );
          if (existing) {
            set({ activeTabId: existing.id });
            return existing.id;
          }
        }
        const tab: EditorTab = {
          id: uuidv4(),
          title: initialFilter
            ? `${tableName} (${initialFilter.column}=${initialFilter.value})`
            : tableName,
          sql: "",
          result: null,
          isRunning: false,
          mode: "data",
          tableName,
          initialFilter,
        };
        set((s) => ({
          tabs: [...s.tabs, tab],
          activeTabId: tab.id,
        }));
        return tab.id;
      },

      closeTab: (id) =>
        set((s) => {
          const idx = s.tabs.findIndex((t) => t.id === id);
          const tabs = s.tabs.filter((t) => t.id !== id);
          if (tabs.length === 0) {
            const newTab = makeTab("Query 1");
            return { tabs: [newTab], activeTabId: newTab.id, _tabCounter: 1 };
          }
          let nextActive = s.activeTabId;
          if (s.activeTabId === id) {
            // Select adjacent: prefer the tab at the same index, or the one before
            const nextIdx = Math.min(idx, tabs.length - 1);
            nextActive = tabs[nextIdx].id;
          }
          return { tabs, activeTabId: nextActive };
        }),

      setActiveTab: (id) => set({ activeTabId: id }),

      updateTabSql: (id, sql) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, sql } : t)),
        })),

      updateTabTitle: (id, title) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
        })),

      setTabResult: (id, result) =>
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, result, isRunning: false } : t,
          ),
        })),

      setTabRunning: (id, isRunning) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, isRunning } : t)),
        })),

      setTabLastExecutedSql: (id, sql) =>
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id ? { ...t, lastExecutedSql: sql } : t,
          ),
        })),

      addToHistory: (sql) =>
        set((s) => ({
          queryHistory: [sql, ...s.queryHistory.filter((h) => h !== sql)].slice(
            0,
            100,
          ),
        })),
    }),
    {
      name: "stoolap-editor",
      version: 1,
      partialize: (state) => {
        let persistedTabs = state.tabs
          .filter((t) => t.mode !== "data")
          .map((t) => ({
            ...t,
            result: null,
            isRunning: false,
          }));
        // Ensure at least one tab is persisted
        if (persistedTabs.length === 0) {
          persistedTabs = [
            { ...makeTab("Query 1"), result: null, isRunning: false },
          ];
        }
        // Ensure activeTabId points to a persisted tab
        const activeValid = persistedTabs.some(
          (t) => t.id === state.activeTabId,
        );
        return {
          tabs: persistedTabs,
          activeTabId: activeValid ? state.activeTabId : persistedTabs[0].id,
          queryHistory: state.queryHistory,
          _tabCounter: state._tabCounter,
        };
      },
    },
  ),
);
