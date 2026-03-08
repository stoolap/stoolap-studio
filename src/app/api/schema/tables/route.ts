import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/lib/db-manager";
import { safeErrorMessage } from "@/lib/sql-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const connId = req.headers.get("X-Connection-Id");
  if (!connId || !dbManager.has(connId)) {
    return NextResponse.json(
      { error: "No active connection" },
      { status: 400 },
    );
  }
  try {
    const result = await dbManager.query(connId, "SHOW TABLES");
    const tables = result.rows.map((r) => String(r[0]));
    return NextResponse.json(tables);
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed") },
      { status: 400 },
    );
  }
}
