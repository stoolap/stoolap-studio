"use client";

import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useConnectionStore } from "@/stores/connection-store";
import * as api from "@/lib/api-client";
import { quoteId } from "@/lib/utils";

const SCHEMA_STALE_TIME = 30_000;

export function useTables() {
  const activeId = useConnectionStore((s) => s.activeId);
  return useQuery({
    queryKey: ["tables", activeId],
    queryFn: () => api.fetchTables(activeId!),
    enabled: !!activeId,
    staleTime: SCHEMA_STALE_TIME,
  });
}

export function useViews() {
  const activeId = useConnectionStore((s) => s.activeId);
  return useQuery({
    queryKey: ["views", activeId],
    queryFn: () => api.fetchViews(activeId!),
    enabled: !!activeId,
    staleTime: SCHEMA_STALE_TIME,
  });
}

export function useTableColumns(
  table: string | null,
  type: "table" | "view" = "table",
) {
  const activeId = useConnectionStore((s) => s.activeId);
  return useQuery({
    queryKey: ["columns", activeId, table, type],
    queryFn: () => api.describeTable(activeId!, table!, type),
    enabled: !!activeId && !!table,
    staleTime: SCHEMA_STALE_TIME,
  });
}

export function useTableIndexes(table: string | null) {
  const activeId = useConnectionStore((s) => s.activeId);
  return useQuery({
    queryKey: ["indexes", activeId, table],
    queryFn: () => api.fetchIndexes(activeId!, table!),
    enabled: !!activeId && !!table,
    staleTime: SCHEMA_STALE_TIME,
  });
}

export function useTableForeignKeys(table: string | null) {
  const activeId = useConnectionStore((s) => s.activeId);
  return useQuery({
    queryKey: ["fks", activeId, table],
    queryFn: () => api.fetchForeignKeys(activeId!, table!),
    enabled: !!activeId && !!table,
    staleTime: SCHEMA_STALE_TIME,
  });
}

export function useTableDDL(
  name: string | null,
  type: "table" | "view" = "table",
) {
  const activeId = useConnectionStore((s) => s.activeId);
  return useQuery({
    queryKey: ["ddl", activeId, type, name],
    queryFn: () => api.fetchDDL(activeId!, name!, type),
    enabled: !!activeId && !!name,
    staleTime: SCHEMA_STALE_TIME,
  });
}

export function useTableRowCount(table: string | null) {
  const activeId = useConnectionStore((s) => s.activeId);
  return useQuery({
    queryKey: ["rowcount", activeId, table],
    queryFn: async () => {
      const result = await api.executeQuery(
        activeId!,
        `SELECT COUNT(*) FROM ${quoteId(table!)}`,
      );
      if ("columns" in result && result.rows.length > 0) {
        return Number(result.rows[0][0]) || 0;
      }
      return 0;
    },
    enabled: !!activeId && !!table,
    staleTime: SCHEMA_STALE_TIME,
  });
}

// Cap the number of tables we fetch columns for in autocomplete to avoid
// firing hundreds of concurrent requests for very large schemas.
const MAX_AUTOCOMPLETE_TABLES = 200;

/** Build a schema map (table -> column names) for CodeMirror autocompletion */
export function useEditorSchema(): Record<string, string[]> | undefined {
  const activeId = useConnectionStore((s) => s.activeId);
  const { data: tables } = useTables();
  const { data: views } = useViews();

  const allNames = useMemo(() => {
    const t = (tables ?? []).map((n) => ({ name: n, type: "table" as const }));
    const v = (views ?? []).map((n) => ({ name: n, type: "view" as const }));
    return [...t, ...v].slice(0, MAX_AUTOCOMPLETE_TABLES);
  }, [tables, views]);

  const columnQueries = useQueries({
    queries: allNames.map((item) => ({
      queryKey: ["columns", activeId, item.name, item.type],
      queryFn: () => api.describeTable(activeId!, item.name, item.type),
      enabled: !!activeId,
      staleTime: Infinity, // manually invalidated on DDL via use-query-execution
    })),
  });

  // Use dataUpdatedAt timestamps as stable dependency instead of the array reference
  // (useQueries returns a new array each render even when data hasn't changed)
  const queryDataKey = columnQueries.map((q) => q.dataUpdatedAt).join(",");

  return useMemo(() => {
    if (allNames.length === 0) return undefined;
    const schema: Record<string, string[]> = {};
    allNames.forEach((item, i) => {
      const data = columnQueries[i]?.data;
      schema[item.name] = data ? data.map((c) => c.field) : [];
    });
    return schema;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNames, queryDataKey]);
}
