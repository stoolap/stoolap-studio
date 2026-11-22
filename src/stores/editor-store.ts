import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { ApiResult, EditorTab, StatementResult } from "@/lib/types";
import i18n from "@/lib/i18n";

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  queryHistory: string[];
  _tabCounter: number;
  addTab: (title?: string, sql?: string, options?: { transient?: boolean }) => string;
  addDataTab: (
    tableName: string,
    initialFilter?: { column: string; value: string },
  ) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabSql: (id: string, sql: string) => void;
  updateTabTitle: (id: string, title: string) => void;
  setTabResult: (id: string, result: ApiResult | null) => void;
  /** A script's results; shows the first that returned rows */
  setTabResults: (id: string, results: StatementResult[], time?: number, error?: string) => void;
  selectTabResult: (id: string, index: number) => void;
  setTabRunning: (id: string, running: boolean) => void;
  setTabLastExecutedSql: (id: string, sql: string, db?: { key: string; name: string; at: number }) => void;
  addToHistory: (sql: string) => void;
}

/** How the example database's query tab starts (see Toolbar) */
export const EXAMPLES_SQL_START = "-- Try these queries:";

interface SavedTabs {
  tabs?: EditorTab[];
  activeTabId?: string | null;
}

/** Drop the "Examples" tabs that version 1 saved, one per example load. */
export function dropSavedExampleTabs(state: SavedTabs): SavedTabs {
  if (!state?.tabs) return state;
  const kept = state.tabs.filter(
    (t) => !(t.title === "Examples" && t.sql.startsWith(EXAMPLES_SQL_START)),
  );
  const tabs = kept.length > 0 ? kept : [{ ...makeTab(i18n.t("editor:tabs.numberedTitle", { n: 1 })), result: null, isRunning: false }];
  const activeTabId = tabs.some((t) => t.id === state.activeTabId) ? state.activeTabId : tabs[0].id;
  return { ...state, tabs, activeTabId };
}

const makeTab = (title?: string, sql?: string): EditorTab => ({
  id: uuidv4(),
  title: title ?? i18n.t("editor:tabs.defaultTitle"),
  sql: sql ?? "",
  result: null,
  isRunning: false,
  mode: "query",
});

const initialTab = makeTab(i18n.t("editor:tabs.numberedTitle", { n: 1 }));

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      tabs: [initialTab],
      activeTabId: initialTab.id,
      queryHistory: [],
      _tabCounter: 1,

      addTab: (title, sql, options) => {
        let tabId = "";
        set((s) => {
          const counter = s._tabCounter + 1;
          const tab = { ...makeTab(title ?? i18n.t("editor:tabs.numberedTitle", { n: counter }), sql), transient: options?.transient };
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
            const newTab = makeTab(i18n.t("editor:tabs.numberedTitle", { n: 1 }));
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
            t.id === id
              ? { ...t, result, results: undefined, resultIndex: undefined, resultsTime: undefined, resultsError: undefined, isRunning: false }
              : t,
          ),
        })),

      setTabResults: (id, results, time, error) =>
        set((s) => {
          const firstRows = results.findIndex((r) => "columns" in r);
          const index = firstRows >= 0 ? firstRows : results.length - 1;
          return {
            tabs: s.tabs.map((t) =>
              t.id === id
                ? { ...t, results, resultIndex: index, result: results[index] ?? null, resultsTime: time, resultsError: error, isRunning: false }
                : t,
            ),
          };
        }),

      selectTabResult: (id, index) =>
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id && t.results?.[index]
              ? { ...t, resultIndex: index, result: t.results[index] }
              : t,
          ),
        })),

      setTabRunning: (id, isRunning) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, isRunning } : t)),
        })),

      setTabLastExecutedSql: (id, sql, db) =>
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === id
              ? db
                ? { ...t, lastExecutedSql: sql, lastDb: db.key, lastDbName: db.name, lastRunAt: db.at }
                : { ...t, lastExecutedSql: sql }
              : t,
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
      version: 2,
      // Version 1 saved the example database's "Examples" tabs, one per load
      migrate: (persisted, version) =>
        (version < 2 ? dropSavedExampleTabs(persisted as SavedTabs) : persisted) as EditorState,
      partialize: (state) => {
        let persistedTabs = state.tabs
          .filter((t) => t.mode !== "data" && !t.transient)
          .map((t): EditorTab => ({
            ...t,
            result: null,
            results: undefined,
            resultIndex: undefined,
            resultsTime: undefined,
            resultsError: undefined,
            isRunning: false,
          }));
        // Ensure at least one tab is persisted
        if (persistedTabs.length === 0) {
          persistedTabs = [
            { ...makeTab(i18n.t("editor:tabs.numberedTitle", { n: 1 })), result: null, isRunning: false },
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

