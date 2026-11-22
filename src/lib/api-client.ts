import type {
  ConnectionMeta,
  QueryResult,
  ExecResult,
  DdlResult,
  ErrorResult,
  ScriptResult,
  ColumnInfo,
  IndexInfo,
  ForeignKeyInfo,
  FilterCondition,
} from "./types";
import i18n from "./i18n";

/**
 * Run a server command (server/commands.ts) by the name and arguments of
 * Stoolap Desktop's Tauri command. A failure rejects with the error's text,
 * as Tauri's invoke does.
 */
export async function rpc<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd, args }),
    });
  } catch (e) {
    throw e instanceof Error ? e.message : String(e);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw (body && typeof body.error === "string" ? body.error : res.statusText);
  return body as T;
}

// Connections
export async function openConnection(
  path: string,
  name?: string,
): Promise<ConnectionMeta> {
  return rpc("db_open", { path, name });
}

export async function listConnections(): Promise<ConnectionMeta[]> {
  return rpc("db_list");
}

export async function closeConnection(id: string): Promise<void> {
  await rpc("db_close", { connId: id });
}

/**
 * Execute a query. If `signal` is provided, rejecting the AbortSignal
 * returns early with a "cancelled" error result — the command itself
 * keeps running on the server (stoolap has no external cancellation hook),
 * but the UI frees up immediately and the stale result is discarded.
 */
export async function executeQuery(
  connId: string,
  sql: string,
  signal?: AbortSignal,
): Promise<QueryResult | ExecResult | DdlResult | ScriptResult | ErrorResult> {
  // Wrap the invoke promise to swallow its rejection into a resolved
  // ErrorResult. Without this, if the user cancels and the backend later
  // rejects, the rejection lands unhandled because Promise.race already
  // resolved via the abort path.
  const invokePromise: Promise<QueryResult | ExecResult | DdlResult | ScriptResult | ErrorResult> =
    rpc<QueryResult | ExecResult | DdlResult | ScriptResult>("db_execute_query", {
      connId,
      sql,
    }).catch((e) => ({
      error: e instanceof Error ? e.message : String(e),
    }));

  if (!signal) return invokePromise;
  if (signal.aborted) return { error: i18n.t("common:errors.queryCancelled") };

  const abortPromise = new Promise<ErrorResult>((resolve) => {
    signal.addEventListener(
      "abort",
      () => resolve({ error: i18n.t("common:errors.queryCancelled") }),
      { once: true },
    );
  });
  return Promise.race([invokePromise, abortPromise]);
}

/**
 * Run SQL and throw when it fails. executeQuery reports a failure as an
 * `{ error }` result instead of throwing, so a try/catch around it never
 * sees one; use this where the caller handles errors with catch.
 */
export async function runSql(
  connId: string,
  sql: string,
): Promise<QueryResult | ExecResult | DdlResult | ScriptResult> {
  const result = await executeQuery(connId, sql);
  if ("error" in result && result.error) throw new Error(result.error);
  return result as QueryResult | ExecResult | DdlResult | ScriptResult;
}

// Schema
export async function fetchTables(connId: string): Promise<string[]> {
  return rpc("db_tables", { connId });
}

export async function fetchViews(connId: string): Promise<string[]> {
  return rpc("db_views", { connId });
}

export async function describeTable(
  connId: string,
  table: string,
  type: "table" | "view" = "table",
): Promise<ColumnInfo[]> {
  return rpc("db_describe", { connId, table, schemaType: type });
}

export async function fetchIndexes(
  connId: string,
  table: string,
): Promise<IndexInfo[]> {
  return rpc("db_indexes", { connId, table });
}

export async function fetchForeignKeys(
  connId: string,
  table: string,
): Promise<ForeignKeyInfo[]> {
  return rpc("db_fks", { connId, table });
}

export async function fetchDDL(
  connId: string,
  name: string,
  type: "table" | "view" = "table",
): Promise<string> {
  return rpc("db_ddl", { connId, name, schemaType: type });
}

// Data
export type { FilterCondition };

export interface TableRowsResult {
  columns: string[];
  rows: unknown[][];
  time: number;
}

export interface TableCountResult {
  totalRows: number;
  time: number;
}

/** One page of a table's rows as INSERT statements (a line each), for a SQL backup. */
export async function fetchTableInserts(
  connId: string,
  table: string,
  offset: number,
  limit: number,
): Promise<{ sql: string; rows: number }> {
  return rpc("db_table_inserts", { connId, table, offset, limit });
}

export async function fetchTableRows(
  connId: string,
  table: string,
  offset = 0,
  limit = 100,
  orderBy?: string,
  orderDir?: "ASC" | "DESC",
  filters?: FilterCondition[],
  asOf?: string,
): Promise<TableRowsResult> {
  return rpc("db_table_rows", {
    connId,
    table,
    offset,
    limit,
    orderBy,
    orderDir,
    filters,
    asOf,
  });
}

export async function fetchTableCount(
  connId: string,
  table: string,
  filters?: FilterCondition[],
  asOf?: string,
): Promise<TableCountResult> {
  return rpc("db_table_count", { connId, table, filters, asOf });
}

export async function insertRow(
  connId: string,
  table: string,
  row: Record<string, unknown>,
): Promise<ExecResult> {
  return rpc("db_insert_row", { connId, table, row });
}

export async function insertRows(
  connId: string,
  table: string,
  rows: Record<string, unknown>[],
): Promise<ExecResult> {
  return rpc("db_insert_rows", { connId, table, rows });
}

export async function updateRow(
  connId: string,
  table: string,
  pkColumn: string,
  pkValue: unknown,
  updates: Record<string, unknown>,
): Promise<ExecResult> {
  return rpc("db_update_row", { connId, table, pkColumn, pkValue, updates });
}

/** Import a CSV or JSON file into a table with COPY (app/api/import) */
export async function importFile(
  connId: string,
  table: string,
  file: File,
  format: "csv" | "json",
  hasHeader: boolean,
): Promise<{ rows: number; time: number }> {
  const form = new FormData();
  form.set("connId", connId);
  form.set("table", table);
  form.set("format", format);
  form.set("header", String(hasHeader));
  form.set("file", file);
  const res = await fetch("/api/import", { method: "POST", body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw (body && typeof body.error === "string" ? body.error : res.statusText);
  return body;
}

export async function deleteRow(
  connId: string,
  table: string,
  pkColumn: string,
  pkValue: unknown,
): Promise<ExecResult> {
  return rpc("db_delete_row", { connId, table, pkColumn, pkValue });
}

/** Statements running longer than `ms` are cancelled by the engine; 0 turns it off. */
/** Whether the connection's session is inside a transaction the user began */
export async function transactionOpen(connId: string): Promise<boolean> {
  return rpc("db_transaction_open", { connId });
}

export async function setQueryTimeout(ms: number): Promise<void> {
  await rpc("db_set_query_timeout", { ms });
}
