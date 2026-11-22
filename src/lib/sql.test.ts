import { describe, expect, it } from "vitest";
import splitCases from "./sql-split-cases.json";
import { explainAll, explainKind, formatDefaultValue, hasReturning, indexQuery, sampleValue, isExplain, isSingleReadOnly, quoteId, splitStatements } from "./sql-utils";

describe("isExplain", () => {
  it("sees EXPLAIN after leading comments", () => {
    expect(isExplain("-- why is this slow\nEXPLAIN ANALYZE\nSELECT 1")).toBe(true);
    expect(isExplain("/* plan */ explain select 1")).toBe(true);
    expect(isExplain("SELECT 'EXPLAIN'")).toBe(false);
    expect(isExplain("-- EXPLAIN\nSELECT 1")).toBe(false);
  });
});
import { generateTableDrops, generateTableIndexes } from "./sql-dump";
import { basename } from "./utils";
import { foldUnchanged, lineDiff } from "./line-diff";

describe("explainAll", () => {
  it("explains every statement, so none of them runs", () => {
    expect(explainAll("SELECT 1; DELETE FROM t")).toBe("EXPLAIN SELECT 1;\nEXPLAIN DELETE FROM t");
  });

  it("keeps an EXPLAIN that is there and drops empty statements", () => {
    expect(explainAll("explain analyze select 1;\n-- done\n;")).toBe("explain analyze select 1");
  });
});

describe("reading SQL like the engine", () => {
  // The same cases are checked against Stoolap's parser in sql_utils.rs
  it.each(splitCases)("$why", ({ sql, statements }) => {
    expect(splitStatements(sql)).toEqual(statements);
  });

  it("never takes a hidden write for a single read", () => {
    for (const { sql } of splitCases.filter((c) => c.sql.includes("DELETE"))) {
      expect(isSingleReadOnly(sql)).toBe(false);
      expect(explainAll(sql)).not.toMatch(/(^|;\n)DELETE/);
    }
    expect(isSingleReadOnly("SELECT 'a\\'' -- '")).toBe(true);
    expect(isSingleReadOnly("SELECT 1 # DELETE")).toBe(true);
    // A quote inside a quoted name isn't a string's start
    expect(isSingleReadOnly(`WITH "a'\\'" AS (SELECT 1) DELETE FROM t WHERE 'x'='x'`)).toBe(false);
    expect(isSingleReadOnly("SELECT `it's` FROM t -- '")).toBe(true);
  });
});

describe("splitStatements", () => {
  it("splits on semicolons outside strings, identifiers and comments", () => {
    const sql = `INSERT INTO t VALUES ('a;b', 'it''s');
      SELECT "odd;name" FROM t; -- trailing; comment
      /* block; comment */ DELETE FROM t`;
    const parts = splitStatements(sql).map((s) => s.trim());
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("INSERT INTO t VALUES ('a;b', 'it''s')");
    expect(parts[1]).toBe('SELECT "odd;name" FROM t');
    expect(parts[2]).toContain("DELETE FROM t");
  });

  it("keeps non-ASCII text intact", () => {
    expect(splitStatements("INSERT INTO t VALUES ('çay')").map((s) => s.trim())).toEqual([
      "INSERT INTO t VALUES ('çay')",
    ]);
  });
});

describe("quoting", () => {
  it("doubles embedded quotes", () => {
    expect(quoteId('a"b')).toBe('"a""b"');
  });

  it("passes keywords and numbers through as DEFAULT values", () => {
    expect(formatDefaultValue("0")).toBe("0");
    expect(formatDefaultValue("current_timestamp")).toBe("current_timestamp");
    expect(formatDefaultValue("pending")).toBe("'pending'");
    expect(formatDefaultValue("it's")).toBe("'it''s'");
    expect(formatDefaultValue("C:\\new")).toBe("'C:\\\\new'");
  });
});

describe("dump generation", () => {
  it("drops referencing tables before the tables they reference", () => {
    // Dependency order: customers is referenced by orders
    expect(generateTableDrops(["customers", "orders"])).toBe(
      'DROP TABLE IF EXISTS "orders";\nDROP TABLE IF EXISTS "customers";\n\n',
    );
    expect(generateTableDrops([])).toBe("");
  });

  it("recreates indexes with an explicit type and skips primary keys", () => {
    const sql = generateTableIndexes("orders", [
      { indexName: "pk_orders", columnName: "id", columns: ["id"], indexType: "BTREE", isUnique: true },
      { indexName: "idx_status", columnName: "status", columns: ["status"], indexType: "HASH", isUnique: false },
      { indexName: "idx_pair", columnName: "(a, b)", columns: ["a", "b"], indexType: "MULTICOLUMN", isUnique: true },
      // A name holding a comma stays one column
      { indexName: "idx_comma", columnName: "(a,b, c)", columns: ["a,b", "c"], indexType: "MULTICOLUMN", isUnique: false },
      {
        indexName: "idx_vec",
        columnName: "embedding",
        columns: ["embedding"],
        indexType: "HNSW",
        isUnique: false,
        options: "metric=cosine, m=16, ef_construction=128",
      },
    ]);
    expect(sql.split("\n").filter(Boolean)).toEqual([
      'CREATE INDEX IF NOT EXISTS "idx_status" ON "orders"("status") USING HASH;',
      'CREATE UNIQUE INDEX IF NOT EXISTS "idx_pair" ON "orders"("a", "b");',
      'CREATE INDEX IF NOT EXISTS "idx_comma" ON "orders"("a,b", "c");',
      `CREATE INDEX IF NOT EXISTS "idx_vec" ON "orders"("embedding") USING HNSW WITH (metric = 'cosine', m = 16, ef_construction = 128);`,
    ]);
  });
});

describe("basename", () => {
  it("handles both path separators", () => {
    expect(basename("/Users/me/data/shop")).toBe("shop");
    expect(basename("C:\\Users\\me\\shop.sql")).toBe("shop.sql");
    expect(basename("/Users/me/data/")).toBe("data");
  });
});

describe("lineDiff", () => {
  it("marks removed and added lines around unchanged ones", () => {
    expect(lineDiff("SELECT *\nFROM t\nWHERE a = 1", "SELECT id\nFROM t\nWHERE a = 1\nLIMIT 5")).toEqual([
      { type: "remove", text: "SELECT *" },
      { type: "add", text: "SELECT id" },
      { type: "same", text: "FROM t" },
      { type: "same", text: "WHERE a = 1" },
      { type: "add", text: "LIMIT 5" },
    ]);
  });

  it("handles an empty side", () => {
    expect(lineDiff("", "SELECT 1")).toEqual([
      { type: "remove", text: "" },
      { type: "add", text: "SELECT 1" },
    ]);
  });
});

describe("foldUnchanged", () => {
  it("keeps context around changes and folds the rest", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g", "h"].join("\n");
    const after = ["a", "b", "c", "d", "e", "F", "g", "h"].join("\n");
    expect(foldUnchanged(lineDiff(before, after), 1)).toEqual([
      { type: "skip", count: 4 },
      { type: "same", text: "e" },
      { type: "remove", text: "f" },
      { type: "add", text: "F" },
      { type: "same", text: "g" },
      { type: "same", text: "h" },
    ]);
  });
});

describe("indexQuery", () => {
  it("writes one runnable condition per column of the index", () => {
    const types: Record<string, string> = { exchange: "Text", symbol: "Text", funding_time: "Timestamp" };
    expect(indexQuery("funding_fees", "idx_ff", ["exchange", "symbol", "funding_time"], (c) => types[c])).toBe(
      [
        "-- Uses the index idx_ff: replace the values with yours",
        'SELECT * FROM "funding_fees"',
        `WHERE "exchange" = ''`,
        `  AND "symbol" = ''`,
        `  AND "funding_time" = '2026-01-01 00:00:00'`,
      ].join("\n"),
    );
    expect(indexQuery("t", "i", ["my col"], () => "Integer")).toContain('WHERE "my col" = 0');
  });

  it("has a value for every column type", () => {
    expect(["Integer", "Float", "Boolean", "Json", "Text", undefined].map(sampleValue)).toEqual([
      "0",
      "0.0",
      "TRUE",
      "'{}'",
      "''",
      "''",
    ]);
  });
});

describe("explainKind", () => {
  it("tells a plan from one whose EXPLAIN ANALYZE ran a write", () => {
    expect(explainKind("EXPLAIN SELECT 1")).toBe("read");
    expect(explainKind("EXPLAIN UPDATE t SET x = 1")).toBe("read");
    expect(explainKind("-- why\nexplain analyze update t set x = 1")).toBe("write");
    expect(explainKind("EXPLAIN ANALYZE SELECT 'DELETE' FROM t")).toBe("read");
    expect(explainKind("SELECT 1")).toBeUndefined();
  });
});

describe("hasReturning", () => {
  it("sees RETURNING outside strings, names and comments", () => {
    expect(hasReturning("INSERT INTO t VALUES (1) RETURNING id")).toBe(true);
    expect(hasReturning("delete from t returning *")).toBe(true);
    expect(hasReturning("EXPLAIN ANALYZE SELECT * FROM t")).toBe(false);
    expect(hasReturning("SELECT 'RETURNING', \"returning\" FROM t -- RETURNING")).toBe(false);
  });
});

describe("isSingleReadOnly", () => {
  it("accepts one reading statement", () => {
    expect(isSingleReadOnly("SELECT * FROM t")).toBe(true);
    expect(isSingleReadOnly("-- top customers\nSELECT name FROM c;")).toBe(true);
    expect(isSingleReadOnly("WITH x AS (SELECT 1) SELECT * FROM x")).toBe(true);
    expect(isSingleReadOnly("SELECT 'delete me' AS note")).toBe(true);
    expect(isSingleReadOnly("EXPLAIN SELECT 1")).toBe(true);
  });

  it("rejects writes, several statements and EXPLAIN ANALYZE", () => {
    expect(isSingleReadOnly("UPDATE t SET a = 1")).toBe(false);
    expect(isSingleReadOnly("DELETE FROM t RETURNING id")).toBe(false);
    expect(isSingleReadOnly("WITH x AS (SELECT 1) DELETE FROM t")).toBe(false);
    expect(isSingleReadOnly("SELECT 1; SELECT 2")).toBe(false);
    expect(isSingleReadOnly("EXPLAIN ANALYZE SELECT 1")).toBe(false);
    expect(isSingleReadOnly("")).toBe(false);
  });
});
