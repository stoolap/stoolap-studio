import { Database } from "@stoolap/node";
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

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Query timeout exceeded (55s)")),
        QUERY_TIMEOUT_MS,
      );
      if (typeof timer === "object" && "unref" in timer) {
        (timer as NodeJS.Timeout).unref();
      }
      promise.then(
        (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
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
    this.touch(connId);
    this.pendingOps.set(connId, (this.pendingOps.get(connId) ?? 0) + 1);
    try {
      return await this.withTimeout(db.queryRaw(sql, params));
    } finally {
      const count = (this.pendingOps.get(connId) ?? 1) - 1;
      if (count <= 0) this.pendingOps.delete(connId);
      else this.pendingOps.set(connId, count);
    }
  }

  async execute(
    connId: string,
    sql: string,
    params?: unknown[],
  ): Promise<{ changes: number }> {
    const db = this.getDb(connId);
    this.touch(connId);
    this.pendingOps.set(connId, (this.pendingOps.get(connId) ?? 0) + 1);
    try {
      return await this.withTimeout(db.execute(sql, params));
    } finally {
      const count = (this.pendingOps.get(connId) ?? 1) - 1;
      if (count <= 0) this.pendingOps.delete(connId);
      else this.pendingOps.set(connId, count);
    }
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
