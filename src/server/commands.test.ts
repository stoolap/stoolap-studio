import { beforeEach, describe, expect, it } from "vitest";
import { commands, parseForeignKeys } from "./commands";
import { dbManager, executeOn } from "./db-manager";

// Stoolap Desktop's tests of its commands (src-tauri/src/commands), run on
// the engine through @stoolap/node

/* eslint-disable @typescript-eslint/no-explicit-any */
let id: string;
const run = (sql: string) => commands.db_execute_query({ connId: id, sql }) as Promise<any>;
const fails = async (sql: string) => {
  try {
    await run(sql);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`${sql} succeeded`);
};
const open = () => dbManager.transactionState(id).value;

beforeEach(async () => {
  id = (await dbManager.open(":memory:")).id;
});

describe("a script", () => {
  it("returns every statement's result", async () => {
    const out = await run(
      "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT);\n" +
        "INSERT INTO t VALUES (1, 'a'), (2, 'b');\n" +
        "SELECT name FROM t ORDER BY id;\n" +
        "SELECT COUNT(*) AS n FROM t;",
    );
    expect(out.results).toHaveLength(4);
    expect(out.results[0].ddl).toBe("CREATE TABLE");
    expect(out.results[1].changes).toBe(2);
    expect(out.results[2].rows).toEqual([["a"], ["b"]]);
    expect(out.results[3]).toMatchObject({ columns: ["n"], sql: "SELECT COUNT(*) AS n FROM t" });
  });

  it("names a failing statement and rolls back", async () => {
    await run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    const out = await run("INSERT INTO t VALUES (1); SELECT * FROM nope;");
    expect(out.error).toMatch(/^Statement 2 of 2:.*rolled back\.$/);
    // The statement before the failure still shows its result
    expect(out.results[0].changes).toBe(1);
    expect((await run("SELECT COUNT(*) FROM t")).rows).toEqual([[0]]);
  });

  it("joins a transaction the user opened", async () => {
    await run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    await run("BEGIN");
    await run("INSERT INTO t VALUES (1); INSERT INTO t VALUES (2)");
    await run("ROLLBACK");
    expect((await run("SELECT COUNT(*) FROM t")).rows).toEqual([[0]]);
    // After the ROLLBACK, scripts get their own transaction again
    await run("INSERT INTO t VALUES (3); INSERT INTO t VALUES (4)");
    expect((await run("SELECT COUNT(*) FROM t")).rows).toEqual([[2]]);
  });

  it("rolls back a write with RETURNING", async () => {
    await run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    const out = await run("INSERT INTO t VALUES (1) RETURNING id; SELECT * FROM nope");
    expect(typeof out.error).toBe("string");
    expect((await run("SELECT COUNT(*) FROM t")).rows).toEqual([[0]]);
  });

  it("returns the rows of a CTE write with RETURNING", async () => {
    await run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    const out = await run("WITH v AS (SELECT 7 AS id) INSERT INTO t SELECT id FROM v RETURNING id");
    expect(out.rows).toEqual([[7]]);
  });

  it("ends the transaction on a failed COMMIT", async () => {
    await run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    await run("BEGIN");
    await run("INSERT INTO t VALUES (1)");
    // Another session takes the same key first, so the COMMIT conflicts
    const other = await dbManager.session(dbManager.getDb(id));
    await executeOn(other, "INSERT INTO t VALUES (1)");
    await fails("COMMIT");
    await other.close();
    // No transaction is open now, so a failing script rolls itself back
    expect(typeof (await run("INSERT INTO t VALUES (2); SELECT * FROM nope")).error).toBe("string");
    expect((await run("SELECT id FROM t ORDER BY id")).rows).toEqual([[1]]);
  });

  it("keeps the transaction on ROLLBACK TO a savepoint", async () => {
    await run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    for (const stmt of ["BEGIN", "SAVEPOINT s1", "ROLLBACK TRANSACTION TO SAVEPOINT s1"]) await run(stmt);
    await run("INSERT INTO t VALUES (1); INSERT INTO t VALUES (2)");
    await run("ROLLBACK");
    expect((await run("SELECT COUNT(*) FROM t")).rows).toEqual([[0]]);
  });

  it("keeps the transaction on a COMMIT that doesn't parse", async () => {
    await run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    await run("BEGIN");
    await run("INSERT INTO t VALUES (1)");
    await fails("COMMIT INVALID");
    await fails("ROLLBACK INVALID");
    await run("INSERT INTO t VALUES (2); INSERT INTO t VALUES (3)");
    await run("ROLLBACK");
    expect((await run("SELECT COUNT(*) FROM t")).rows).toEqual([[0]]);
  });

  it("never leaves its own transaction open", async () => {
    await run("CREATE TABLE p (id INTEGER PRIMARY KEY); CREATE TABLE c (id INTEGER PRIMARY KEY, p INTEGER REFERENCES p(id))");
    await run("INSERT INTO p VALUES (1)");

    // It began its transaction and failed before its own ROLLBACK
    const out = await run("BEGIN; INSERT INTO p VALUES (2) RETURNING id; INSERT INTO c VALUES (1, 99); ROLLBACK");
    expect(out.error).toMatch(/^Statement 3 of 4:/);
    expect(out.error).toMatch(/The statement after it did not run\. The transaction the script began was rolled back\.$/);
    expect(out.results[1].rows).toEqual([[2]]);
    expect(out.failed).toBe("INSERT INTO c VALUES (1, 99)");
    expect(out.notRun).toEqual(["ROLLBACK"]);
    expect(out.rolledBack).toBe(true);
    expect(open()).toBe(false);
    expect((await run("SELECT COUNT(*) FROM p")).rows).toEqual([[1]]);

    // A transaction the user opened earlier is theirs: it stays, and the error says so
    await run("BEGIN");
    const mine = await run("INSERT INTO p VALUES (3); INSERT INTO c VALUES (1, 99)");
    expect(mine.error).toMatch(/run COMMIT or ROLLBACK to end it\.$/);
    expect(open()).toBe(true);
    expect(await fails("INSERT INTO c VALUES (1, 99)")).toMatch(/run COMMIT or ROLLBACK to end it\.$/);
    await run("ROLLBACK");
    expect(open()).toBe(false);
  });
});

describe("values", () => {
  it("keep integers past 2^53 exact, as text", async () => {
    await run("CREATE TABLE t (id INTEGER PRIMARY KEY, v INTEGER)");
    await run("INSERT INTO t VALUES (9007199254740993, 1), (9007199254740992, 2), (5, 3)");
    const out = await run("SELECT id FROM t ORDER BY id");
    expect(out.rows).toEqual([[5], ["9007199254740992"], ["9007199254740993"]]);
    // Text reads back into the INTEGER key
    await commands.db_delete_row({ connId: id, table: "t", pkColumn: "id", pkValue: "9007199254740993" });
    expect((await run("SELECT COUNT(*) FROM t")).rows).toEqual([[2]]);
  });

  it("show vectors and timestamps as the engine writes them", async () => {
    await run("CREATE TABLE t (id INTEGER PRIMARY KEY, v VECTOR(3), ts TIMESTAMP)");
    await run("INSERT INTO t VALUES (1, '[0.1, 2.5, -3]', '2026-01-02 03:04:05')");
    expect((await run("SELECT v, ts FROM t")).rows).toEqual([["[0.1, 2.5, -3]", "2026-01-02T03:04:05.000Z"]]);
  });

  it("go into a backup as SQL that restores them", async () => {
    await run(
      "CREATE TABLE t (id INTEGER PRIMARY KEY, big INTEGER, f FLOAT, s TEXT, b BOOLEAN, j JSON, v VECTOR(2), n TEXT)",
    );
    await run(
      `INSERT INTO t VALUES (1, 9007199254740993, 0.1, 'it''s a\\\\b', TRUE, '{"k": [1, null]}', '[0.5, 1]', NULL)`,
    );
    const { sql, rows } = (await commands.db_table_inserts({ connId: id, table: "t", offset: 0, limit: 10 })) as any;
    expect(rows).toBe(1);
    const before = (await run("SELECT * FROM t")).rows;
    await run("DELETE FROM t");
    await run(sql);
    expect((await run("SELECT * FROM t")).rows).toEqual(before);
  });
});

describe("the schema", () => {
  it("lists tables without the engine's statistics tables", async () => {
    await run("CREATE TABLE t (id INTEGER PRIMARY KEY); ANALYZE t");
    expect(await commands.db_tables({ connId: id })).toEqual(["t"]);
  });

  it("reads a column's CHECK and default from DESCRIBE", async () => {
    await run("CREATE TABLE t (id INTEGER PRIMARY KEY AUTO_INCREMENT, age INTEGER NOT NULL DEFAULT 3 CHECK (age >= 0))");
    const cols = (await commands.db_describe({ connId: id, table: "t", schemaType: "table" })) as any[];
    expect(cols[1]).toEqual({
      field: "age",
      type: "INTEGER",
      nullable: false,
      key: "",
      defaultValue: "3",
      extra: "CHECK (age >= 0)",
    });
  });

  it("parses every foreign key on one line", () => {
    const fks = parseForeignKeys(
      "CREATE TABLE orders (id INTEGER PRIMARY KEY AUTO_INCREMENT, customer_id INTEGER NOT NULL, product_id INTEGER NOT NULL, " +
        "FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE RESTRICT, " +
        'FOREIGN KEY ("product id") REFERENCES "my products"(id) ON DELETE CASCADE ON UPDATE RESTRICT)',
    );
    expect(fks).toEqual([
      { columnName: "customer_id", referencedTable: "customers", referencedColumn: "id", onDelete: "RESTRICT", onUpdate: "RESTRICT" },
      { columnName: "product id", referencedTable: "my products", referencedColumn: "id", onDelete: "CASCADE", onUpdate: "RESTRICT" },
    ]);
  });

  it("reads the foreign keys the engine writes", async () => {
    await run('CREATE TABLE "my p" (id INTEGER PRIMARY KEY); CREATE TABLE c (id INTEGER PRIMARY KEY, p INTEGER REFERENCES "my p"(id) ON DELETE CASCADE)');
    expect(await commands.db_fks({ connId: id, table: "c" })).toEqual([
      { columnName: "p", referencedTable: "my p", referencedColumn: "id", onDelete: "CASCADE", onUpdate: "RESTRICT" },
    ]);
  });
});

describe("table data", () => {
  it("filters, sorts and counts", async () => {
    await run("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, v VECTOR(2))");
    await run("INSERT INTO t VALUES (1, 'a', '[1, 0]'), (2, 'b', '[0, 1]'), (3, 'c', '[1, 0.1]')");
    const rows = (await commands.db_table_rows({
      connId: id,
      table: "t",
      offset: 0,
      limit: 10,
      orderBy: "id",
      orderDir: "DESC",
      filters: [{ column: "name", operator: "in", value: "a|c" }],
    })) as any;
    expect(rows.rows.map((r: unknown[]) => r[0])).toEqual([3, 1]);
    const near = (await commands.db_table_count({
      connId: id,
      table: "t",
      filters: [{ column: "v", operator: "l2", value: "[1, 0]|0.5" }],
    })) as any;
    expect(near.totalRows).toBe(2);
  });

  it("inserts rows in one transaction, all or none", async () => {
    await run("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
    await expect(
      commands.db_insert_rows({ connId: id, table: "t", rows: [{ id: 1, name: "a" }, { id: 2, name: null }] }),
    ).rejects.toThrow();
    expect((await run("SELECT COUNT(*) FROM t")).rows).toEqual([[0]]);
    await commands.db_insert_rows({ connId: id, table: "t", rows: [{ id: 1, name: "a" }, { id: 2, name: "b" }] });
    expect((await run("SELECT COUNT(*) FROM t")).rows).toEqual([[2]]);
  });
});
