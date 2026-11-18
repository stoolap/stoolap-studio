import { Database, type Transaction } from "@stoolap/node";
import { v4 as uuidv4 } from "uuid";
import type { ConnectionMeta } from "./types";

interface Connection {
  db: Database;
  meta: ConnectionMeta;
}

const MAX_CONNECTIONS = 20;
const QUERY_TIMEOUT_MS = 55_000;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const IDLE_CHECK_INTERVAL_MS = 60_000;

class DbManager {
  private connections = new Map<string, Connection>();
  private lastActivity = new Map<string, number>();
  private pendingOps = new Map<string, number>();
  private idleTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.idleTimer = setInterval(
      () => this.evictIdle(),
      IDLE_CHECK_INTERVAL_MS,
    );
    if (
      this.idleTimer &&
      typeof this.idleTimer === "object" &&
      "unref" in this.idleTimer
    ) {
      (this.idleTimer as NodeJS.Timeout).unref();
    }
  }

  private touch(connId: string): void {
    this.lastActivity.set(connId, Date.now());
  }

  private async evictIdle(): Promise<void> {
    const now = Date.now();
    for (const [id, lastTime] of this.lastActivity) {
      if (
        now - lastTime > IDLE_TIMEOUT_MS &&
        this.connections.has(id) &&
        !this.pendingOps.get(id)
      ) {
        const conn = this.connections.get(id);
        this.connections.delete(id);
        this.lastActivity.delete(id);
        try {
          await conn?.db.close();
        } catch {
          // Ignore close errors during eviction
        }
      }
    }
  }

  /** Count an in-flight operation so idle eviction never closes a busy connection. */
  private async track<T>(connId: string, op: () => Promise<T>): Promise<T> {
    this.touch(connId);
    this.pendingOps.set(connId, (this.pendingOps.get(connId) ?? 0) + 1);
    try {
      return await op();
    } finally {
      const count = (this.pendingOps.get(connId) ?? 1) - 1;
      if (count <= 0) this.pendingOps.delete(connId);
      else this.pendingOps.set(connId, count);
    }
  }

  async open(path: string, name?: string): Promise<ConnectionMeta> {
    if (this.connections.size >= MAX_CONNECTIONS) {
      throw new Error(
        `Maximum of ${MAX_CONNECTIONS} simultaneous connections reached`,
      );
    }
    const isMemory =
      !path || path === ":memory:" || path.startsWith("memory://");
    const id = uuidv4();
    // Each in-memory DB gets a unique DSN so they don't share data
    const dsn = isMemory ? `memory://${id}` : path;
    const db = await Database.open(dsn);
    try {
      // The engine cancels any statement that runs past this deadline.
      await db.execute(`PRAGMA query_timeout = ${QUERY_TIMEOUT_MS}`);
    } catch (e) {
      await db.close().catch(() => {});
      throw e;
    }
    const meta: ConnectionMeta = {
      id,
      name: name || (isMemory ? "In-Memory" : path.split("/").pop() || path),
      path: path || ":memory:",
      type: isMemory ? "memory" : "file",
      createdAt: Date.now(),
    };
    this.connections.set(id, { db, meta });
    this.touch(id);
    return meta;
  }

  getDb(connId: string): Database {
    const conn = this.connections.get(connId);
    if (!conn) throw new Error(`Connection ${connId} not found`);
    return conn.db;
  }

  async query(
    connId: string,
    sql: string,
    params?: unknown[],
  ): Promise<{ columns: string[]; rows: unknown[][] }> {
    const db = this.getDb(connId);
    return this.track(connId, () => db.queryRaw(sql, params));
  }

  async execute(
    connId: string,
    sql: string,
    params?: unknown[],
  ): Promise<{ changes: number }> {
    const db = this.getDb(connId);
    return this.track(connId, () => db.execute(sql, params));
  }

  /**
   * Run `fn` on a clone of the connection's handle. The clone shares the
   * engine but has its own transaction state, so a BEGIN issued on it (DDL
   * included) is not joined by requests running concurrently on the
   * connection.
   */
  async session<T>(connId: string, fn: (db: Database) => Promise<T>): Promise<T> {
    const db = this.getDb(connId);
    return this.track(connId, async () => {
      const clone = db.clone();
      try {
        // A clone does not inherit the handle's query timeout.
        await clone.execute(`PRAGMA query_timeout = ${QUERY_TIMEOUT_MS}`);
        return await fn(clone);
      } finally {
        await clone.close().catch(() => {});
      }
    });
  }

  /**
   * Run `fn` inside its own transaction: committed when it resolves, rolled
   * back when it throws. Requests running concurrently on the same
   * connection do not see or join it. DML only: the driver's Transaction
   * refuses DDL.
   */
  async transaction<T>(
    connId: string,
    fn: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    const db = this.getDb(connId);
    return this.track(connId, async () => {
      const tx = await db.begin();
      try {
        const result = await fn(tx);
        await tx.commit();
        return result;
      } catch (e) {
        try {
          await tx.rollback();
        } catch {
          /* ignore rollback errors */
        }
        throw e;
      }
    });
  }

  async close(connId: string): Promise<void> {
    const conn = this.connections.get(connId);
    if (conn) {
      this.connections.delete(connId);
      this.lastActivity.delete(connId);
      this.pendingOps.delete(connId);
      await conn.db.close();
    }
  }

  list(): ConnectionMeta[] {
    return Array.from(this.connections.values()).map((c) => c.meta);
  }

  has(connId: string): boolean {
    return this.connections.has(connId);
  }

  async closeExample(): Promise<void> {
    const ids: string[] = [];
    for (const [id, conn] of this.connections) {
      if (conn.meta.name === "Example DB") {
        ids.push(id);
      }
    }
    for (const id of ids) {
      const conn = this.connections.get(id);
      // Remove from map first so it's gone even if db.close() fails
      this.connections.delete(id);
      this.lastActivity.delete(id);
      this.pendingOps.delete(id);
      try {
        await conn?.db.close();
      } catch {
        // Ignore close errors for cleanup
      }
    }
  }
}

// Singleton - survives hot reloads in dev and module re-evaluation in production
const globalForDb = globalThis as unknown as { dbManager?: DbManager };
export const dbManager = globalForDb.dbManager ?? new DbManager();
globalForDb.dbManager = dbManager;
