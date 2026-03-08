"use client";

import { useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editor-store";
import { useQueryExecution } from "@/hooks/use-query-execution";
import { formatSQL } from "@/lib/sql-formatter";

export function KeyboardShortcuts() {
  const { executeQuery, isConnected } = useQueryExecution();
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const addTab = useEditorStore((s) => s.addTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const updateTabSql = useEditorStore((s) => s.updateTabSql);

  // Use refs for volatile values so the keydown listener stays stable
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const isConnectedRef = useRef(isConnected);
  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
    isConnectedRef.current = isConnected;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const currentTabs = tabsRef.current;
      const currentActiveTabId = activeTabIdRef.current;

      // Ctrl/Cmd+T - New tab
      if (mod && e.key === "t" && !e.shiftKey) {
        e.preventDefault();
        addTab();
        return;
      }

      // Ctrl/Cmd+W - Close tab
      if (mod && e.key === "w") {
        e.preventDefault();
        if (currentActiveTabId) closeTab(currentActiveTabId);
        return;
      }

      // Ctrl/Cmd+Enter is handled by CodeMirror keymap

      // Ctrl/Cmd+E - Explain
      if (mod && e.key === "e" && !e.shiftKey) {
        e.preventDefault();
        const activeTab = currentTabs.find((t) => t.id === currentActiveTabId);
        if (
          activeTab &&
          activeTab.sql.trim() &&
          isConnectedRef.current &&
          !activeTab.isRunning
        ) {
          const sql = activeTab.sql.trimStart();
          const query = sql.toUpperCase().startsWith("EXPLAIN")
            ? sql
            : `EXPLAIN ${sql}`;
          executeQuery(activeTab.id, query);
        }
        return;
      }

      // Ctrl/Cmd+? - Shortcuts help
      if (mod && (e.key === "?" || (e.shiftKey && e.key === "/"))) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("stoolap:shortcuts-help"));
        return;
      }

      // Ctrl/Cmd+Shift+F - Format SQL
      if (mod && e.shiftKey && e.key === "f") {
        e.preventDefault();
        const activeTab = currentTabs.find((t) => t.id === currentActiveTabId);
        if (activeTab && activeTab.sql.trim()) {
          updateTabSql(activeTab.id, formatSQL(activeTab.sql));
        }
        return;
      }

      // Ctrl/Cmd+B - Toggle sidebar
      if (mod && e.key === "b" && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("stoolap:toggle-sidebar"));
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab - Switch tabs
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (currentTabs.length < 2) return;
        const idx = currentTabs.findIndex((t) => t.id === currentActiveTabId);
        if (e.shiftKey) {
          const prev = (idx - 1 + currentTabs.length) % currentTabs.length;
          setActiveTab(currentTabs[prev].id);
        } else {
          const next = (idx + 1) % currentTabs.length;
          setActiveTab(currentTabs[next].id);
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [addTab, closeTab, setActiveTab, executeQuery, updateTabSql]);

  return null;
}
