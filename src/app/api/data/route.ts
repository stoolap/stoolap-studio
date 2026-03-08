import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/lib/db-manager";
import { quoteId, safeErrorMessage } from "@/lib/sql-utils";
import type { FilterCondition } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const connId = req.headers.get("X-Connection-Id");
  if (!connId || !dbManager.has(connId)) {
    return NextResponse.json(
      { error: "No active connection" },
      { status: 400 },
    );
  }
  const table = req.nextUrl.searchParams.get("table");
  const offsetStr = req.nextUrl.searchParams.get("offset") ?? "0";
  const limitStr = req.nextUrl.searchParams.get("limit") ?? "100";
  const orderBy = req.nextUrl.searchParams.get("orderBy");
  const orderDir = req.nextUrl.searchParams.get("orderDir") ?? "ASC";

  if (!table) {
    return NextResponse.json({ error: "Missing table param" }, { status: 400 });
  }
  if (!["ASC", "DESC"].includes(orderDir.toUpperCase())) {
    return NextResponse.json({ error: "Invalid orderDir" }, { status: 400 });
  }

  const offset = Math.max(0, parseInt(offsetStr, 10) || 0);
  const limit = Math.min(100_000, Math.max(1, parseInt(limitStr, 10) || 100));

  try {
    // Count total rows (with filters applied)
    const asOf = req.nextUrl.searchParams.get("asOf");
    if (
      asOf &&
      !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(asOf)
    ) {
      return NextResponse.json(
        { error: "Invalid timestamp format" },
        { status: 400 },
      );
    }

    const params: unknown[] = [];
    let paramIdx = 1;

    // AS OF TIMESTAMP uses a parameterized placeholder
    let tableRef: string;
    if (asOf) {
      tableRef = `${quoteId(table)} AS OF TIMESTAMP $${paramIdx++}`;
      params.push(asOf);
    } else {
      tableRef = quoteId(table);
    }

    let countSql = `SELECT COUNT(*) AS cnt FROM ${tableRef}`;
    let dataSql = `SELECT * FROM ${tableRef}`;
    let vecDistExpr: string | null = null;

    // Parse filters from JSON-encoded query param
    const filtersParam = req.nextUrl.searchParams.get("filters");
    if (filtersParam) {
      let filters: FilterCondition[];
      try {
        filters = JSON.parse(filtersParam);
      } catch {
        return NextResponse.json(
          { error: "Invalid filters format" },
          { status: 400 },
        );
      }

      if (!Array.isArray(filters)) {
        return NextResponse.json(
          { error: "Filters must be an array" },
          { status: 400 },
        );
      }

      const clauses: string[] = [];
      for (const f of filters) {
        if (
          !f ||
          typeof f.column !== "string" ||
          !f.column ||
          typeof f.operator !== "string"
        ) {
          continue;
        }
        if (f.value !== undefined && typeof f.value !== "string") {
          f.value = String(f.value);
        }
        const quotedCol = quoteId(f.column);
        switch (f.operator) {
          case "null":
            clauses.push(`${quotedCol} IS NULL`);
            break;
          case "nnull":
            clauses.push(`${quotedCol} IS NOT NULL`);
            break;
          case "in": {
            if (typeof f.value !== "string" || !f.value) break;
            const inVals = f.value.split("|").filter(Boolean);
            if (inVals.length === 0) break;
            const placeholders = inVals.map(() => `$${paramIdx++}`);
            clauses.push(`${quotedCol} IN (${placeholders.join(",")})`);
            params.push(...inVals);
            break;
          }
          case "cosine":
          case "l2":
          case "ip": {
            if (typeof f.value !== "string" || !f.value) break;
            const pipeIdx = f.value.lastIndexOf("|");
            if (pipeIdx === -1) break;
            const vecStr = f.value.substring(0, pipeIdx).trim();
            const thresholdStr = f.value.substring(pipeIdx + 1).trim();
            const threshold = parseFloat(thresholdStr);
            if (isNaN(threshold) || threshold <= 0) break;
            if (!/^\[[\d\s,.\-+eE]+\]$/.test(vecStr)) break;
            const distFnMap: Record<string, string> = {
              cosine: "VEC_DISTANCE_COSINE",
              l2: "VEC_DISTANCE_L2",
              ip: "VEC_DISTANCE_IP",
            };
            const distFn = distFnMap[f.operator];
            const vecParamIdx = paramIdx++;
            const thresholdParamIdx = paramIdx++;
            const distExpr = `${distFn}(${quotedCol}, $${vecParamIdx})`;
            clauses.push(`${distExpr} < $${thresholdParamIdx}`);
            params.push(vecStr, threshold);
            if (!vecDistExpr) vecDistExpr = distExpr;
            break;
          }
          default: {
            const opMap: Record<string, string> = {
              eq: "=",
              neq: "!=",
              gt: ">",
              gte: ">=",
              lt: "<",
              lte: "<=",
              like: "LIKE",
              nlike: "NOT LIKE",
            };
            const sqlOp = opMap[f.operator];
            if (sqlOp && f.value !== undefined) {
              clauses.push(`${quotedCol} ${sqlOp} $${paramIdx++}`);
              params.push(f.value);
            }
            break;
          }
        }
      }
      if (clauses.length > 0) {
        const where = ` WHERE ${clauses.join(" AND ")}`;
        countSql += where;
        dataSql += where;
      }

      // Add vector distance column to SELECT for similarity search results
      if (vecDistExpr) {
        dataSql = dataSql.replace(
          "SELECT *",
          `SELECT *, ${vecDistExpr} AS _vec_dist`,
        );
      }
    }

    if (orderBy) {
      dataSql += ` ORDER BY ${quoteId(orderBy)} ${orderDir.toUpperCase()}`;
    } else if (vecDistExpr) {
      dataSql += ` ORDER BY _vec_dist ASC`;
    }
    dataSql += ` LIMIT ${limit} OFFSET ${offset}`;

    const start = performance.now();
    const queryParams = params.length > 0 ? params : undefined;
    const results = await Promise.allSettled([
      dbManager.query(connId, countSql, queryParams),
      dbManager.query(connId, dataSql, queryParams),
    ]);
    const time = Math.round((performance.now() - start) * 100) / 100;

    if (results[1].status === "rejected") {
      throw results[1].reason;
    }
    const dataResult = results[1].value;
    const totalRows =
      results[0].status === "fulfilled"
        ? Number(results[0].value.rows[0]?.[0] ?? 0)
        : -1;

    return NextResponse.json({
      columns: dataResult.columns,
      rows: dataResult.rows,
      totalRows,
      time,
    });
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed") },
      { status: 400 },
    );
  }
}

export async function POST(req: NextRequest) {
  const connId = req.headers.get("X-Connection-Id");
  if (!connId || !dbManager.has(connId)) {
    return NextResponse.json(
      { error: "No active connection" },
      { status: 400 },
    );
  }
  try {
    const body = await req.json();
    const { table } = body;
    if (!table || typeof table !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid table name" },
        { status: 400 },
      );
    }

    // Batch insert: { table, rows: Record<string, unknown>[] }
    if (Array.isArray(body.rows)) {
      const rows: Record<string, unknown>[] = body.rows;
      if (rows.length === 0) {
        return NextResponse.json({ changes: 0, time: 0 });
      }
      if (rows.length > 10_000) {
        return NextResponse.json(
          { error: "Batch insert limited to 10,000 rows" },
          { status: 400 },
        );
      }
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          return NextResponse.json(
            { error: "Each row must be a plain object" },
            { status: 400 },
          );
        }
      }
      const start = performance.now();
      let totalChanges = 0;

      // Group rows by column signature for efficient multi-row INSERT
      const groups = new Map<string, Record<string, unknown>[]>();
      for (const row of rows) {
        const key = Object.keys(row).sort().join("\0");
        const group = groups.get(key);
        if (group) group.push(row);
        else groups.set(key, [row]);
      }

      await dbManager.execute(connId, "BEGIN");
      try {
        const BATCH_SIZE = 500;
        for (const [, groupRows] of groups) {
          const cols = Object.keys(groupRows[0]);
          if (cols.length === 0) continue;
          const quotedCols = cols.map(quoteId).join(", ");

          for (let i = 0; i < groupRows.length; i += BATCH_SIZE) {
            const batch = groupRows.slice(i, i + BATCH_SIZE);
            const allVals: unknown[] = [];
            const rowPlaceholders: string[] = [];
            let pi = 1;
            for (const row of batch) {
              rowPlaceholders.push(
                `(${cols.map(() => `$${pi++}`).join(", ")})`,
              );
              for (const col of cols) allVals.push(row[col]);
            }
            const sql = `INSERT INTO ${quoteId(table)} (${quotedCols}) VALUES ${rowPlaceholders.join(", ")}`;
            const result = await dbManager.execute(connId, sql, allVals);
            totalChanges += result.changes;
          }
        }
        await dbManager.execute(connId, "COMMIT");
      } catch (e) {
        try {
          await dbManager.execute(connId, "ROLLBACK");
        } catch {
          /* ignore rollback errors */
        }
        throw e;
      }
      const time = Math.round((performance.now() - start) * 100) / 100;
      return NextResponse.json({ changes: totalChanges, time });
    }

    // Single insert: { table, row: Record<string, unknown> }
    const { row } = body;
    if (!row || typeof row !== "object" || Object.keys(row).length === 0) {
      return NextResponse.json(
        { error: "Missing or empty row data" },
        { status: 400 },
      );
    }
    const cols = Object.keys(row);
    const vals = Object.values(row);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `INSERT INTO ${quoteId(table)} (${cols.map(quoteId).join(", ")}) VALUES (${placeholders})`;
    const start = performance.now();
    const result = await dbManager.execute(connId, sql, vals as unknown[]);
    const time = Math.round((performance.now() - start) * 100) / 100;
    return NextResponse.json({ changes: result.changes, time });
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed") },
      { status: 400 },
    );
  }
}
