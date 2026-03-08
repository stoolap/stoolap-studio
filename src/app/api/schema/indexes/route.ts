import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/lib/db-manager";
import { quoteId, safeErrorMessage } from "@/lib/sql-utils";
import type { IndexInfo } from "@/lib/types";

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
  if (!table) {
    return NextResponse.json({ error: "Missing table param" }, { status: 400 });
  }
  try {
    const quotedTable = quoteId(table);
    const result = await dbManager.query(
      connId,
      `SHOW INDEXES FROM ${quotedTable}`,
    );
    // Columns: table_name, index_name, column_name, index_type, is_unique
    const indexes: IndexInfo[] = result.rows.map((r) => ({
      tableName: String(r[0] ?? ""),
      indexName: String(r[1] ?? ""),
      columnName: String(r[2] ?? ""),
      indexType: String(r[3] ?? ""),
      isUnique: r[4] === true || r[4] === 1 || String(r[4]) === "true",
    }));
    return NextResponse.json(indexes);
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed") },
      { status: 400 },
    );
  }
}
