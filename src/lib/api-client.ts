import type {
  ConnectionMeta,
  QueryResult,
  ExecResult,
  DdlResult,
  ErrorResult,
  ColumnInfo,
  IndexInfo,
  ForeignKeyInfo,
  FilterCondition,
} from "./types";

const TIMEOUT_MS = 30_000;

const headers = (connId?: string) => {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (connId) h["X-Connection-Id"] = connId;
  return h;
};

function withTimeout(ms = TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}

async function json<T>(res: Response): Promise<T> {
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Request failed with status ${res.status}`);
  }
  if (!res.ok)
    throw new Error(
      (data as { error?: string }).error ||
        `Request failed with status ${res.status}`,
    );
  return data as T;
}

// Connections
export async function openConnection(
  path: string,
  name?: string,
): Promise<ConnectionMeta> {
  const res = await fetch("/api/connections", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ path, name }),
    signal: withTimeout(),
  });
  return json<ConnectionMeta>(res);
}

export async function listConnections(): Promise<ConnectionMeta[]> {
  const res = await fetch("/api/connections", {
    cache: "no-store",
    signal: withTimeout(),
  });
  return json<ConnectionMeta[]>(res);
}

export async function closeConnection(id: string): Promise<void> {
  const res = await fetch(`/api/connections/${id}`, {
    method: "DELETE",
    signal: withTimeout(),
  });
  if (!res.ok) {
    let msg = `Failed to close connection (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
    } catch {
      /* non-JSON response */
    }
    throw new Error(msg);
  }
}

// Query
function combineSignals(
  signal: AbortSignal,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (typeof AbortSignal.any === "function") {
    return { signal: AbortSignal.any([signal, timeout]), cleanup: () => {} };
  }
  // Fallback for older runtimes
  const controller = new AbortController();
  const cleanup = () => {
    signal.removeEventListener("abort", onAbort);
    timeout.removeEventListener("abort", onAbort);
  };
  const onAbort = () => {
    controller.abort();
    cleanup();
  };
  if (signal.aborted || timeout.aborted) {
    controller.abort();
    return { signal: controller.signal, cleanup };
  }
  signal.addEventListener("abort", onAbort, { once: true });
  timeout.addEventListener("abort", onAbort, { once: true });
  return { signal: controller.signal, cleanup };
}

export async function executeQuery(
  connId: string,
  sql: string,
  signal?: AbortSignal,
): Promise<QueryResult | ExecResult | DdlResult | ErrorResult> {
  const combined = signal
    ? combineSignals(signal, 60_000)
    : { signal: withTimeout(60_000), cleanup: () => {} };
  try {
    const res = await fetch("/api/query", {
      method: "POST",
      headers: headers(connId),
      body: JSON.stringify({ sql }),
      signal: combined.signal,
    });
    return json<QueryResult | ExecResult | DdlResult | ErrorResult>(res);
  } finally {
    combined.cleanup();
  }
}

// Schema
export async function fetchTables(connId: string): Promise<string[]> {
  const res = await fetch("/api/schema/tables", {
    headers: headers(connId),
    signal: withTimeout(),
  });
  return json<string[]>(res);
}

export async function fetchViews(connId: string): Promise<string[]> {
  const res = await fetch("/api/schema/views", {
    headers: headers(connId),
    signal: withTimeout(),
  });
  return json<string[]>(res);
}

export async function describeTable(
  connId: string,
  table: string,
  type: "table" | "view" = "table",
): Promise<ColumnInfo[]> {
  const res = await fetch(
    `/api/schema/describe?table=${encodeURIComponent(table)}&type=${type}`,
    { headers: headers(connId), signal: withTimeout() },
  );
  return json<ColumnInfo[]>(res);
}

export async function fetchIndexes(
  connId: string,
  table: string,
): Promise<IndexInfo[]> {
  const res = await fetch(
    `/api/schema/indexes?table=${encodeURIComponent(table)}`,
    { headers: headers(connId), signal: withTimeout() },
  );
  return json<IndexInfo[]>(res);
}

export async function fetchForeignKeys(
  connId: string,
  table: string,
): Promise<ForeignKeyInfo[]> {
  const res = await fetch(
    `/api/schema/fks?table=${encodeURIComponent(table)}`,
    { headers: headers(connId), signal: withTimeout() },
  );
  return json<ForeignKeyInfo[]>(res);
}

export async function fetchDDL(
  connId: string,
  name: string,
  type: "table" | "view" = "table",
): Promise<string> {
  const res = await fetch(
    `/api/schema/ddl?${type}=${encodeURIComponent(name)}`,
    { headers: headers(connId), signal: withTimeout() },
  );
  const data = await json<{ ddl: string }>(res);
  return data.ddl;
}

// Data
export type { FilterCondition };

export interface TableDataResult {
  columns: string[];
  rows: unknown[][];
  totalRows: number;
  time: number;
}

export async function fetchTableData(
  connId: string,
  table: string,
  offset = 0,
  limit = 100,
  orderBy?: string,
  orderDir?: "ASC" | "DESC",
  filters?: FilterCondition[],
  asOf?: string,
): Promise<TableDataResult> {
  const params = new URLSearchParams({
    table,
    offset: String(offset),
    limit: String(limit),
  });
  if (orderBy) params.set("orderBy", orderBy);
  if (orderDir) params.set("orderDir", orderDir);
  if (filters && filters.length > 0) {
    params.set("filters", JSON.stringify(filters));
  }
  if (asOf) params.set("asOf", asOf);
  const res = await fetch(`/api/data?${params}`, {
    headers: headers(connId),
    signal: withTimeout(),
  });
  return json<TableDataResult>(res);
}

export async function insertRow(
  connId: string,
  table: string,
  row: Record<string, unknown>,
): Promise<ExecResult> {
  const res = await fetch("/api/data", {
    method: "POST",
    headers: headers(connId),
    body: JSON.stringify({ table, row }),
    signal: withTimeout(),
  });
  return json<ExecResult>(res);
}

export async function insertRows(
  connId: string,
  table: string,
  rows: Record<string, unknown>[],
): Promise<ExecResult> {
  const res = await fetch("/api/data", {
    method: "POST",
    headers: headers(connId),
    body: JSON.stringify({ table, rows }),
    signal: withTimeout(120_000),
  });
  return json<ExecResult>(res);
}

export async function updateRow(
  connId: string,
  table: string,
  pkColumn: string,
  pkValue: unknown,
  updates: Record<string, unknown>,
): Promise<ExecResult> {
  const res = await fetch("/api/data/row", {
    method: "PUT",
    headers: headers(connId),
    body: JSON.stringify({ table, pkColumn, pkValue, updates }),
    signal: withTimeout(),
  });
  return json<ExecResult>(res);
}

export async function deleteRow(
  connId: string,
  table: string,
  pkColumn: string,
  pkValue: unknown,
): Promise<ExecResult> {
  const res = await fetch("/api/data/row", {
    method: "DELETE",
    headers: headers(connId),
    body: JSON.stringify({ table, pkColumn, pkValue }),
    signal: withTimeout(),
  });
  return json<ExecResult>(res);
}
