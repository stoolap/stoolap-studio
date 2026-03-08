import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/lib/db-manager";
import { quoteId, safeErrorMessage } from "@/lib/sql-utils";
import { parseForeignKeys } from "@/lib/fk-parser";

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
    const result = await dbManager.query(
      connId,
      `SHOW CREATE TABLE ${quoteId(table)}`,
    );
    const ddl = result.rows.length > 0 ? String(result.rows[0][1] ?? "") : "";
    const fks = parseForeignKeys(ddl);
    return NextResponse.json(fks);
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed") },
      { status: 400 },
    );
  }
}
