import { NextRequest, NextResponse } from "next/server";
import { dbManager } from "@/lib/db-manager";
import { quoteId, safeErrorMessage } from "@/lib/sql-utils";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  const connId = req.headers.get("X-Connection-Id");
  if (!connId || !dbManager.has(connId)) {
    return NextResponse.json(
      { error: "No active connection" },
      { status: 400 },
    );
  }
  try {
    const { table, pkColumn, pkValue, updates } = await req.json();
    if (!table || typeof table !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid table name" },
        { status: 400 },
      );
    }
    if (
      !pkColumn ||
      typeof pkColumn !== "string" ||
      pkValue === undefined ||
      pkValue === null
    ) {
      return NextResponse.json(
        { error: "Missing primary key info" },
        { status: 400 },
      );
    }
    if (
      !updates ||
      typeof updates !== "object" ||
      Array.isArray(updates) ||
      Object.keys(updates).length === 0
    ) {
      return NextResponse.json(
        { error: "Missing or empty updates" },
        { status: 400 },
      );
    }
    const setCols = Object.keys(updates);
    const setVals = Object.values(updates) as unknown[];
    const setClause = setCols
      .map((col, i) => `${quoteId(col)} = $${i + 1}`)
      .join(", ");
    const sql = `UPDATE ${quoteId(table)} SET ${setClause} WHERE ${quoteId(pkColumn)} = $${setCols.length + 1}`;
    const start = performance.now();
    const result = await dbManager.execute(connId, sql, [
      ...setVals,
      pkValue as unknown,
    ]);
    const time = Math.round((performance.now() - start) * 100) / 100;
    return NextResponse.json({ changes: result.changes, time });
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed") },
      { status: 400 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const connId = req.headers.get("X-Connection-Id");
  if (!connId || !dbManager.has(connId)) {
    return NextResponse.json(
      { error: "No active connection" },
      { status: 400 },
    );
  }
  try {
    const { table, pkColumn, pkValue } = await req.json();
    if (!table || typeof table !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid table name" },
        { status: 400 },
      );
    }
    if (
      !pkColumn ||
      typeof pkColumn !== "string" ||
      pkValue === undefined ||
      pkValue === null
    ) {
      return NextResponse.json(
        { error: "Missing primary key info" },
        { status: 400 },
      );
    }
    const sql = `DELETE FROM ${quoteId(table)} WHERE ${quoteId(pkColumn)} = $1`;
    const start = performance.now();
    const result = await dbManager.execute(connId, sql, [pkValue as unknown]);
    const time = Math.round((performance.now() - start) * 100) / 100;
    return NextResponse.json({ changes: result.changes, time });
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e, "Failed") },
      { status: 400 },
    );
  }
}
