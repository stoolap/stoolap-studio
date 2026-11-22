import type { Database } from "@stoolap/node";
import type { ColumnInfo, FilterCondition, ForeignKeyInfo, IndexInfo } from "@/lib/types";
import { splitStatements } from "@/lib/sql-utils";
import { dbManager, executeOn, queryOn, type Exec, type Rows } from "./db-manager";
import { classifyStatement, modifiesData, stripComments, transactionControl } from "./sql";
import { sqlLiteral } from "./values";

// Stoolap Desktop's Tauri commands (src-tauri/src/commands), by the same
// names and arguments: the UI calls them through /api/rpc as Desktop calls
// them through invoke.

const quoteId = (id: string) => `"${id.replace(/"/g, '""')}"`;
const elapsed = (start: number) => Math.round((performance.now() - start) * 100) / 100;

// --- Query ---

type StatementResult =
  | { columns: string[]; rows: unknown[][]; time: number }
  | { ddl: string; time: number }
  | { changes: number; time: number };

/** Added to a failed script's error: what became of what it did */
const SCRIPT_ROLLED_BACK = " Nothing this script did was kept: it ran in a transaction that was rolled back.";
const BEGUN_ROLLED_BACK = " The transaction the script began was rolled back.";
/** Added to an error that leaves the user's own transaction open */
const STILL_OPEN = " The transaction is still open: run COMMIT or ROLLBACK to end it.";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** An engine error as a sentence, so what is added after it reads apart */
function sentence(e: string): string {
  return /[.!?]\s*$/.test(e) ? e : `${e}.`;
}

/**
 * Follow BEGIN, COMMIT and ROLLBACK run on the connection's own handle. One
 * the engine couldn't parse never ran and leaves the transaction as it was.
 * A COMMIT or ROLLBACK that parsed ends the transaction even when it fails
 * (a COMMIT that hits a write conflict leaves none open); ROLLBACK TO a
 * savepoint keeps it.
 */
function noteTransaction(state: { value: boolean }, stmt: string, error: string | null) {
  const kind = transactionControl(stmt);
  if (!kind || (error && /^parse error/i.test(error))) return;
  if (kind === "begin" && !error) state.value = true;
  else if (kind === "commit" || kind === "rollback") state.value = false;
}

async function executeSingle(db: Database, stmt: string): Promise<StatementResult> {
  const start = performance.now();
  switch (classifyStatement(stmt)) {
    case "query": {
      const { columns, rows } = await queryOn(db, stmt);
      return { columns, rows, time: elapsed(start) };
    }
    case "ddl": {
      await executeOn(db, stmt);
      const ddl = stmt.trim().split(/\s+/).slice(0, 2).join(" ").toUpperCase();
      return { ddl, time: elapsed(start) };
    }
    default: {
      const { changes } = await executeOn(db, stmt);
      return { changes, time: elapsed(start) };
    }
  }
}

/** Run what the editor holds: one statement, or several (DML wrapped in a
 *  transaction), returning each statement's result. */
async function runScript(connId: string, sql: string) {
  const cleaned = stripComments(sql);
  if (!cleaned) throw new Error("Empty query");
  const statements = splitStatements(cleaned);
  if (statements.length === 0) throw new Error("Empty query");

  // The connection's own handle (not a clone, which is a session of its
  // own), so a transaction the user opened in an earlier run is seen here
  const conn = dbManager.getDb(connId);
  const inTransaction = dbManager.transactionState(connId);
  // A transaction from an earlier run that this run joins
  const wasOpen = inTransaction.value;

  if (statements.length === 1) {
    try {
      const result = await executeSingle(conn, statements[0]);
      noteTransaction(inTransaction, statements[0], null);
      return result;
    } catch (e) {
      noteTransaction(inTransaction, statements[0], message(e));
      throw new Error(inTransaction.value ? `${sentence(message(e))}${STILL_OPEN}` : message(e));
    }
  }

  const start = performance.now();
  const hasExplicitTxn = statements.some((s) =>
    /^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT)/i.test(s.trimStart()),
  );
  // Inside a transaction the user opened, the script joins it instead
  const hasDml = !hasExplicitTxn && !inTransaction.value && statements.some(modifiesData);

  // The BEGIN/COMMIT wrapper runs on a clone of the handle, its own session:
  // requests running concurrently on this connection neither join the
  // wrapper transaction nor roll back with it
  const session = hasDml ? await dbManager.session(conn) : null;
  const db = session ?? conn;
  try {
    if (hasDml) await executeOn(db, "BEGIN");

    const total = statements.length;
    const results: (StatementResult & { sql: string })[] = [];
    let error: string | null = null;
    let failed: string | undefined;
    let notRun: string[] = [];
    for (let i = 0; i < total; i++) {
      const stmt = statements[i];
      let result: StatementResult;
      try {
        result = await executeSingle(db, stmt);
        if (!session) noteTransaction(inTransaction, stmt, null);
      } catch (e) {
        if (!session) noteTransaction(inTransaction, stmt, message(e));
        // What didn't run is as much the outcome as what did
        const left = total - (i + 1);
        const unrun =
          left === 0 ? "" : left === 1 ? " The statement after it did not run." : ` The ${left} statements after it did not run.`;
        error = `Statement ${i + 1} of ${total}: ${sentence(message(e))}${unrun}`;
        failed = stmt;
        notRun = statements.slice(i + 1);
        break;
      }
      results.push({ ...result, sql: stmt });
    }
    const time = elapsed(start);

    if (error === null) {
      if (hasDml) await executeOn(db, "COMMIT");
      return { results, time };
    }
    // Say what became of the transaction, and never leave one the user
    // didn't open behind
    let rolledBack = false;
    if (hasDml) {
      await executeOn(db, "ROLLBACK").catch(() => {});
      rolledBack = true;
      error += SCRIPT_ROLLED_BACK;
    } else if (!wasOpen && inTransaction.value) {
      // The script began a transaction and stopped before its own COMMIT or
      // ROLLBACK: left open, every later run would join it unawares
      await executeOn(db, "ROLLBACK").catch(() => {});
      inTransaction.value = false;
      rolledBack = true;
      error += BEGUN_ROLLED_BACK;
    } else if (inTransaction.value) {
      error += STILL_OPEN;
    }
    if (results.length === 0) throw new Error(error);
    return {
      results,
      time,
      error,
      failed,
      ...(notRun.length ? { notRun } : {}),
      ...(rolledBack ? { rolledBack } : {}),
    };
  } finally {
    await session?.close().catch(() => {});
  }
}

// --- Schema ---

const firstColumn = (r: Rows) => r.rows.map((row) => row[0]).filter((v): v is string => typeof v === "string");

async function describe(connId: string, table: string, schemaType: string): Promise<ColumnInfo[]> {
  if (schemaType === "view") {
    // Views have no DESCRIBE: column types are guessed from the first row,
    // TEXT where it holds NULL
    const r = await dbManager.query(connId, `SELECT * FROM ${quoteId(table)} LIMIT 1`);
    return r.columns.map((field, i) => ({
      field,
      type: inferType(r.rows[0]?.[i]),
      nullable: true,
      key: "",
      defaultValue: "",
      extra: "",
    }));
  }
  const r = await dbManager.query(connId, `DESCRIBE ${quoteId(table)}`);
  return r.rows.map((row) => {
    const s = (i: number) => (typeof row[i] === "string" ? (row[i] as string) : "");
    return { field: s(0), type: s(1), nullable: s(2) === "YES", key: s(3), defaultValue: s(4), extra: s(5) };
  });
}

function inferType(v: unknown): string {
  if (typeof v === "boolean") return "BOOLEAN";
  if (typeof v === "number") return Number.isInteger(v) ? "INTEGER" : "FLOAT";
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return "TIMESTAMP";
    if (/^\s*[[{]/.test(v)) return v.trimStart().startsWith("[") && /^\[[\d\s.,eE+-]*\]$/.test(v) ? "VECTOR" : "JSON";
  }
  return "TEXT";
}

/** The columns of an index as SHOW INDEXES writes them: one name, or
 *  "(a, b, c)" for several, joined with ", " */
function indexColumns(listed: string): string[] {
  const l = listed.trim();
  const m = /^\((.*)\)$/.exec(l);
  return m ? m[1].split(", ").map((c) => c.trim()).filter(Boolean) : [l];
}

async function indexes(connId: string, table: string): Promise<IndexInfo[]> {
  const r = await dbManager.query(connId, `SHOW INDEXES FROM ${quoteId(table)}`);
  return r.rows.map((row) => {
    const s = (i: number) => (typeof row[i] === "string" ? (row[i] as string) : "");
    const u = row[4];
    return {
      tableName: s(0),
      indexName: s(1),
      columnName: s(2),
      columns: indexColumns(s(2)),
      indexType: s(3),
      isUnique: u === true || u === 1 || u === "true",
      options: s(5),
    };
  });
}

/** The table's foreign keys, from SHOW CREATE TABLE, which prints the whole
 *  table on one line: the DDL is cut at each FOREIGN KEY clause */
export function parseForeignKeys(ddl: string): ForeignKeyInfo[] {
  const upper = ddl.toUpperCase();
  const starts: number[] = [];
  for (let i = upper.indexOf("FOREIGN KEY"); i >= 0; i = upper.indexOf("FOREIGN KEY", i + 1)) starts.push(i);
  const fks: ForeignKeyInfo[] = [];
  starts.forEach((start, n) => {
    const clause = ddl.slice(start, starts[n + 1] ?? ddl.length).trim();
    const up = clause.toUpperCase();
    const ref = up.indexOf("REFERENCES");
    if (ref < 0) return;
    const column = parenId(clause.slice(11));
    const [refTable, rest] = leadingId(clause.slice(ref + 10));
    const refColumn = parenId(rest);
    if (column && refTable) {
      fks.push({
        columnName: column,
        referencedTable: refTable,
        referencedColumn: refColumn || "id",
        onDelete: action(up, "ON DELETE"),
        onUpdate: action(up, "ON UPDATE"),
      });
    }
  });
  return fks;
}

const unquote = (s: string) => (/^".*"$/.test(s) ? s.slice(1, -1).replace(/""/g, '"') : s.replace(/^`|`$/g, ""));

function parenId(s: string): string {
  const m = /\(\s*("(?:[^"]|"")*"|[^)]*?)\s*\)/.exec(s);
  return m ? unquote(m[1].trim()) : "";
}

function leadingId(s: string): [string, string] {
  const t = s.trimStart();
  const m = /^("(?:[^"]|"")*"|[^\s(]+)/.exec(t);
  return m ? [unquote(m[1]), t.slice(m[1].length)] : ["", t];
}

function action(upper: string, keyword: string): string {
  const at = upper.indexOf(keyword);
  if (at < 0) return "NO ACTION";
  const after = upper.slice(at + keyword.length).trimStart();
  return ["CASCADE", "SET NULL", "SET DEFAULT", "RESTRICT", "NO ACTION"].find((a) => after.startsWith(a)) ?? "NO ACTION";
}

async function showCreate(connId: string, keyword: "TABLE" | "VIEW", name: string): Promise<string> {
  const r = await dbManager.query(connId, `SHOW CREATE ${keyword} ${quoteId(name)}`);
  const row = r.rows[0];
  const ddl = row?.[1] ?? row?.[0];
  return typeof ddl === "string" ? ddl : "";
}

// --- Data ---

/** Only digits, minus, dot, comma, e, whitespace and brackets: a vector's text */
function vectorLiteral(s: string): string {
  const t = s.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) throw new Error("A vector must look like [0.1, 0.2, ...]");
  if (!/^[\d.,+\-eE[\]\s]*$/.test(t)) throw new Error("A vector may hold only numbers");
  return t;
}

/** The WHERE clause and its parameters for the grid's filters */
function buildWhere(filters?: FilterCondition[] | null): [string, unknown[]] {
  if (!filters?.length) return ["", []];
  const clauses: string[] = [];
  const params: unknown[] = [];
  const cmp: Record<string, string> = { eq: "=", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "LIKE", LIKE: "LIKE", nlike: "NOT LIKE", "NOT LIKE": "NOT LIKE" };
  const fns: Record<string, string> = { cosine: "VEC_DISTANCE_COSINE", l2: "VEC_DISTANCE_L2", ip: "VEC_DISTANCE_IP" };
  for (const f of filters) {
    const col = quoteId(f.column);
    const op = f.operator;
    if (op === "null" || op === "IS NULL") clauses.push(`${col} IS NULL`);
    else if (op === "nnull" || op === "IS NOT NULL") clauses.push(`${col} IS NOT NULL`);
    else if (cmp[op]) {
      clauses.push(`${col} ${cmp[op]} ?`);
      params.push(f.value);
    } else if (op === "in" || op === "IN") {
      const parts = f.value.split("|").map((s) => s.trim()).filter(Boolean);
      if (!parts.length) throw new Error("IN needs at least one value");
      clauses.push(`${col} IN (${parts.map(() => "?").join(", ")})`);
      params.push(...parts);
    } else if (fns[op]) {
      // Vector distance: "[vector]|threshold"
      const pipe = f.value.lastIndexOf("|");
      if (pipe < 0) throw new Error("A vector filter is written [vector]|threshold");
      const threshold = Number(f.value.slice(pipe + 1).trim());
      if (!Number.isFinite(threshold)) throw new Error("Invalid threshold");
      // As parameters: the engine reads a vector from its text ('[1, 2]')
      clauses.push(`${fns[op]}(${col}, ?) < ?`);
      params.push(vectorLiteral(f.value.slice(0, pipe)), threshold);
    } else throw new Error(`Unsupported filter operator: ${op}`);
  }
  return [` WHERE ${clauses.join(" AND ")}`, params];
}

/** AS OF TIMESTAMP, inlined (the engine takes no ? there), so only the
 *  characters of a timestamp are allowed */
function asOfClause(ts?: string | null): string {
  const t = ts?.trim();
  if (!t) return "";
  if (!/^[\d\-: T.+Z]*$/.test(t)) throw new Error("Invalid AS OF timestamp");
  return ` AS OF TIMESTAMP '${t}'`;
}

/** One page of a table's rows as INSERT statements, for a SQL backup. Made
 *  here from the driver's values, so JSON and 64-bit integers stay exact. */
async function tableInserts(connId: string, table: string, offset: number, limit: number) {
  const t = quoteId(table);
  const r = await dbManager
    .getDb(connId)
    .queryRaw(`SELECT * FROM ${t} LIMIT ${Math.max(0, limit)} OFFSET ${Math.max(0, offset)}`);
  const head = `INSERT INTO ${t} (${r.columns.map(quoteId).join(", ")}) VALUES (`;
  const sql = r.rows.map((row) => `${head}${row.map(sqlLiteral).join(", ")});\n`).join("");
  return { sql, rows: r.rows.length };
}

async function insertRows(connId: string, table: string, rows: Record<string, unknown>[]): Promise<Exec> {
  if (!rows.length) return { changes: 0, time: 0 };
  const cols = Object.keys(rows[0]);
  const sql = `INSERT INTO ${quoteId(table)} (${cols.map(quoteId).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
  // BEGIN / INSERTs / COMMIT on a session of its own, which requests running
  // concurrently on this connection neither join nor roll back with
  const db = await dbManager.session(dbManager.getDb(connId));
  const start = performance.now();
  try {
    await executeOn(db, "BEGIN");
    let changes = 0;
    try {
      for (const row of rows) changes += (await executeOn(db, sql, cols.map((c) => row[c] ?? null))).changes;
      await executeOn(db, "COMMIT");
    } catch (e) {
      await executeOn(db, "ROLLBACK").catch(() => {});
      throw e;
    }
    return { changes, time: elapsed(start) };
  } finally {
    await db.close().catch(() => {});
  }
}

/** A file path as COPY reads it: a quote is doubled, except right after a
 *  backslash, which keeps the character after it */
export function copyPath(path: string): string {
  let out = "'";
  for (let i = 0; i < path.length; i++) {
    const c = path[i];
    if (c === "\\") {
      if (i + 1 >= path.length) throw new Error("A file path can't end in a backslash");
      out += c + path[++i];
    } else out += c === "'" ? "''" : c;
  }
  return `${out}'`;
}

export async function importFile(connId: string, table: string, filePath: string, format: string, hasHeader: boolean) {
  const fmt = format.toUpperCase();
  if (fmt !== "CSV" && fmt !== "JSON") throw new Error(`Unsupported format: ${format}`);
  const start = performance.now();
  const { changes } = await dbManager.execute(
    connId,
    `COPY ${quoteId(table)} FROM ${copyPath(filePath)} WITH (FORMAT ${fmt}, HEADER ${hasHeader ? "true" : "false"})`,
  );
  return { rows: changes, time: elapsed(start) };
}

// --- System ---

let engineVersion: string | undefined;

/** The engine's version as `SELECT VERSION()` gives it */
async function stoolapVersion(): Promise<string> {
  if (!engineVersion) {
    const { Database } = await import("@stoolap/node");
    const db = await Database.open("memory://version");
    try {
      engineVersion = String((await db.queryRaw("SELECT VERSION()")).rows[0][0]);
    } finally {
      await db.close().catch(() => {});
    }
  }
  return engineVersion;
}

// --- The commands ---

/* eslint-disable @typescript-eslint/no-explicit-any */
type Args = Record<string, any>;

export const commands: Record<string, (a: Args) => Promise<unknown>> = {
  db_open: (a) => dbManager.open(a.path, a.name ?? undefined),
  db_close: (a) => dbManager.close(a.connId),
  db_list: async () => dbManager.list(),
  db_close_example: () => dbManager.closeExample(),
  db_set_query_timeout: (a) => dbManager.setQueryTimeout(Math.max(0, Number(a.ms) || 0)),
  db_execute_query: (a) => runScript(a.connId, a.sql),
  db_transaction_open: async (a) => dbManager.transactionState(a.connId).value,

  db_tables: async (a) =>
    // The engine's statistics tables (_sys_table_stats, ... after ANALYZE) are hidden
    firstColumn(await dbManager.query(a.connId, "SHOW TABLES")).filter((t) => !t.startsWith("_sys_")),
  db_views: async (a) => firstColumn(await dbManager.query(a.connId, "SHOW VIEWS")),
  db_describe: (a) => describe(a.connId, a.table, a.schemaType),
  db_indexes: (a) => indexes(a.connId, a.table),
  db_fks: async (a) => parseForeignKeys(await showCreate(a.connId, "TABLE", a.table)),
  db_ddl: (a) => showCreate(a.connId, a.schemaType === "view" ? "VIEW" : "TABLE", a.name),

  db_table_rows: async (a) => {
    const [where, params] = buildWhere(a.filters);
    const order = a.orderBy ? ` ORDER BY ${quoteId(a.orderBy)} ${a.orderDir === "DESC" ? "DESC" : "ASC"}` : "";
    const sql = `SELECT * FROM ${quoteId(a.table)}${asOfClause(a.asOf)}${where}${order} LIMIT ${Math.max(0, Number(a.limit) || 0)} OFFSET ${Math.max(0, Number(a.offset) || 0)}`;
    const start = performance.now();
    const { columns, rows } = await dbManager.query(a.connId, sql, params);
    return { columns, rows, time: elapsed(start) };
  },
  db_table_count: async (a) => {
    const [where, params] = buildWhere(a.filters);
    const start = performance.now();
    const r = await dbManager.query(a.connId, `SELECT COUNT(*) FROM ${quoteId(a.table)}${asOfClause(a.asOf)}${where}`, params);
    return { totalRows: Number(r.rows[0]?.[0] ?? 0), time: elapsed(start) };
  },
  db_table_inserts: (a) => tableInserts(a.connId, a.table, Number(a.offset) || 0, Number(a.limit) || 0),
  db_insert_row: (a) => {
    const cols = Object.keys(a.row);
    return dbManager.execute(
      a.connId,
      `INSERT INTO ${quoteId(a.table)} (${cols.map(quoteId).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      cols.map((c) => a.row[c]),
    );
  },
  db_insert_rows: (a) => insertRows(a.connId, a.table, a.rows),
  db_update_row: (a) => {
    const cols = Object.keys(a.updates);
    return dbManager.execute(
      a.connId,
      `UPDATE ${quoteId(a.table)} SET ${cols.map((c) => `${quoteId(c)} = ?`).join(", ")} WHERE ${quoteId(a.pkColumn)} = ?`,
      [...cols.map((c) => a.updates[c]), a.pkValue],
    );
  },
  db_delete_row: (a) =>
    dbManager.execute(a.connId, `DELETE FROM ${quoteId(a.table)} WHERE ${quoteId(a.pkColumn)} = ?`, [a.pkValue]),

  get_stoolap_version: () => stoolapVersion(),
};
