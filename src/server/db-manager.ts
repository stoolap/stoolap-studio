import { Database } from "@stoolap/node";
import { randomUUID } from "node:crypto";
import type { ConnectionMeta } from "@/lib/types";
import { toCell } from "./values";

// The server's half of Stoolap Desktop's src-tauri/src/db.rs: open
// connections, their transaction state and the query timeout.

interface Connection {
  db: Database;
  meta: ConnectionMeta;
  /**
   * The user ran BEGIN on this handle and has not committed or rolled back
   * yet. The engine can't be asked (a second BEGIN or a stray ROLLBACK
   * succeeds silently), so it is tracked here.
   */
  inTransaction: { value: boolean };
}

export interface Rows {
  columns: string[];
  rows: unknown[][];
  time: number;
}

export interface Exec {
  changes: number;
  time: number;
}

/** Statements running longer than this are cancelled by the engine. The UI
 *  can change it; 0 turns it off. */
export const DEFAULT_QUERY_TIMEOUT_MS = 5 * 60 * 1000;

const elapsed = (start: number) => Math.round((performance.now() - start) * 100) / 100;

/** A query's result, its cells as the UI reads them */
export async function queryOn(db: Database, sql: string, params?: unknown[]): Promise<Rows> {
  const start = performance.now();
  const result = await db.queryRaw(sql, params?.length ? params : undefined);
  return {
    columns: result.columns,
    rows: result.rows.map((row) => row.map(toCell)),
    time: elapsed(start),
  };
}

export async function executeOn(db: Database, sql: string, params?: unknown[]): Promise<Exec> {
  const start = performance.now();
  const { changes } = await db.execute(sql, params?.length ? params : undefined);
  return { changes, time: elapsed(start) };
}

class DbManager {
  private connections = new Map<string, Connection>();
  private queryTimeoutMs = DEFAULT_QUERY_TIMEOUT_MS;

  private async applyTimeout(db: Database) {
    await db.execute(`PRAGMA query_timeout = ${this.queryTimeoutMs}`);
  }

  /** A clone of `db`: a separate session with its own transaction state.
   *  A clone does not inherit the handle's query timeout, so it is set here. */
  async session(db: Database): Promise<Database> {
    const session = db.clone();
    await this.applyTimeout(session);
    return session;
  }

  /** Change the query timeout for every open connection and the ones opened later. */
  async setQueryTimeout(ms: number) {
    this.queryTimeoutMs = ms;
    for (const c of this.connections.values()) await this.applyTimeout(c.db);
  }

  private get(connId: string): Connection {
    const conn = this.connections.get(connId);
    if (!conn) throw new Error("Connection not found");
    return conn;
  }

  /** The connection's own handle: every caller shares it, so a transaction
   *  the user began in one run is still open in the next. */
  getDb(connId: string): Database {
    return this.get(connId).db;
  }

  transactionState(connId: string): { value: boolean } {
    return this.get(connId).inTransaction;
  }

  async open(path: string, name?: string): Promise<ConnectionMeta> {
    const isMemory = path === ":memory:";
    const id = randomUUID();
    // Each in-memory database gets a DSN of its own, so they don't share data
    const dsn = isMemory ? `memory://${id}` : path.startsWith("file://") ? path : `file://${path}`;
    const db = await Database.open(dsn);
    try {
      await this.applyTimeout(db);
    } catch (e) {
      await db.close().catch(() => {});
      throw e;
    }
    const meta: ConnectionMeta = {
      id,
      name: name || (isMemory ? "In-Memory" : path.split(/[\\/]/).filter(Boolean).pop() || path),
      path,
      type: isMemory ? "memory" : "file",
    };
    this.connections.set(id, { db, meta, inTransaction: { value: false } });
    return meta;
  }

  async close(connId: string) {
    const conn = this.connections.get(connId);
    if (!conn) return;
    this.connections.delete(connId);
    await conn.db.close();
  }

  async closeExample() {
    for (const [id, conn] of this.connections) {
      if (conn.meta.name !== "Example DB") continue;
      this.connections.delete(id);
      await conn.db.close().catch(() => {});
    }
  }

  list(): ConnectionMeta[] {
    return [...this.connections.values()].map((c) => c.meta);
  }

  query(connId: string, sql: string, params?: unknown[]) {
    return queryOn(this.getDb(connId), sql, params);
  }

  execute(connId: string, sql: string, params?: unknown[]) {
    return executeOn(this.getDb(connId), sql, params);
  }
}

// One manager for the server: it survives hot reloads in development
const globalForDb = globalThis as unknown as { stoolapDbManager?: DbManager };
export const dbManager = (globalForDb.stoolapDbManager ??= new DbManager());
