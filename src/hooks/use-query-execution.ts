"use client";

import { useCallback, useEffect, useRef } from "react";
import { useConnectionStore } from "@/stores/connection-store";
import { useEditorStore } from "@/stores/editor-store";
import { useQueryClient } from "@tanstack/react-query";
import { splitStatements } from "@/lib/sql-utils";
import * as api from "@/lib/api-client";

function isDDL(sql: string): boolean {
  const upper = sql.trimStart().toUpperCase();
  return (
    upper.startsWith("CREATE") ||
    upper.startsWith("DROP") ||
    upper.startsWith("ALTER") ||
    upper.startsWith("TRUNCATE")
  );
}

export function useQueryExecution() {
  const activeId = useConnectionStore((s) => s.activeId);
  const queryClient = useQueryClient();
  const abortMapRef = useRef<Map<string, AbortController>>(new Map());

  // Abort all pending queries on unmount
  useEffect(() => {
    const map = abortMapRef.current;
    return () => {
      for (const controller of map.values()) {
        controller.abort();
      }
      map.clear();
    };
  }, []);

  const executeQuery = useCallback(
    async (tabId: string, sql: string) => {
      if (!activeId || !sql.trim()) return;

      const { setTabRunning, setTabLastExecutedSql, addToHistory } =
        useEditorStore.getState();

      // Cancel any running query for THIS tab
      abortMapRef.current.get(tabId)?.abort();
      const controller = new AbortController();
      abortMapRef.current.set(tabId, controller);

      setTabRunning(tabId, true);
      setTabLastExecutedSql(tabId, sql.trim());
      addToHistory(sql.trim());

      try {
        const result = await api.executeQuery(activeId, sql, controller.signal);
        if (controller.signal.aborted) {
          useEditorStore
            .getState()
            .setTabResult(tabId, { error: "Query cancelled" });
          return;
        }
        useEditorStore.getState().setTabResult(tabId, result);

        // Refresh schema sidebar after DDL statements (scoped to active connection)
        const statements = splitStatements(sql);
        if (statements.some(isDDL)) {
          queryClient.invalidateQueries({ queryKey: ["tables", activeId] });
          queryClient.invalidateQueries({ queryKey: ["views", activeId] });
          queryClient.invalidateQueries({ queryKey: ["columns", activeId] });
          queryClient.invalidateQueries({ queryKey: ["indexes", activeId] });
          queryClient.invalidateQueries({ queryKey: ["fks", activeId] });
          queryClient.invalidateQueries({ queryKey: ["rowcount", activeId] });
          queryClient.invalidateQueries({ queryKey: ["ddl", activeId] });
          queryClient.invalidateQueries({ queryKey: ["tableData", activeId] });
        }
      } catch (e) {
        if (controller.signal.aborted) {
          useEditorStore
            .getState()
            .setTabResult(tabId, { error: "Query cancelled" });
          return;
        }
        useEditorStore.getState().setTabResult(tabId, {
          error: e instanceof Error ? e.message : "Query failed",
        });
      } finally {
        abortMapRef.current.delete(tabId);
      }
    },
    [activeId, queryClient],
  );

  const cancelQuery = useCallback((tabId?: string) => {
    if (tabId) {
      abortMapRef.current.get(tabId)?.abort();
    } else {
      // Cancel all running queries
      for (const controller of abortMapRef.current.values()) {
        controller.abort();
      }
    }
  }, []);

  return { executeQuery, cancelQuery, isConnected: !!activeId };
}
