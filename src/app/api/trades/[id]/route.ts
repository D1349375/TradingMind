import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcRMultiple } from "@/lib/r-multiple";

const ALLOWED_GRADES = ["A", "B", "C", "D"];

function optionalNum(v: unknown): number | null | undefined {
  if (v === undefined) return undefined; // 沒帶這個欄位,不動它
  if (v === null || v === "") return null; // 明確清空
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// 只開放使用者自己填的主觀欄位;自動同步欄位(價格/損益等)不接受從前端改,
// 那些是 Bybit 的事實資料,可改就失去「強制完整性」的意義(規劃書第二節)。
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  let body: {
    reflectionNote?: unknown;
    grade?: unknown;
    customValues?: unknown;
    setupId?: unknown;
    ruleChecks?: unknown;
    stopLossPrice?: unknown;
    takeProfitPrice?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const data: {
    reflectionNote?: string | null;
    grade?: string | null;
    setupId?: string | null;
    stopLossPrice?: number | null;
    takeProfitPrice?: number | null;
    rMultiple?: number | null;
  } = {};

  if ("stopLossPrice" in body) {
    const v = optionalNum(body.stopLossPrice);
    if (v === undefined) {
      return NextResponse.json({ error: "止損價格式錯誤" }, { status: 400 });
    }
    if (v !== null && v <= 0) {
      return NextResponse.json({ error: "止損價必須是正數" }, { status: 400 });
    }
    data.stopLossPrice = v;
  }

  if ("takeProfitPrice" in body) {
    const v = optionalNum(body.takeProfitPrice);
    if (v === undefined) {
      return NextResponse.json({ error: "目標價格式錯誤" }, { status: 400 });
    }
    data.takeProfitPrice = v;
  }

  if ("reflectionNote" in body) {
    if (typeof body.reflectionNote !== "string" && body.reflectionNote !== null) {
      return NextResponse.json({ error: "反思筆記格式錯誤" }, { status: 400 });
    }
    data.reflectionNote = body.reflectionNote || null;
  }

  if ("grade" in body) {
    if (body.grade === null || body.grade === "") {
      data.grade = null;
    } else if (
      typeof body.grade === "string" &&
      ALLOWED_GRADES.includes(body.grade)
    ) {
      data.grade = body.grade;
    } else {
      return NextResponse.json({ error: "評分只能是 A/B/C/D" }, { status: 400 });
    }
  }

  if ("setupId" in body) {
    if (body.setupId === null) {
      data.setupId = null;
    } else if (typeof body.setupId === "string") {
      const owned = await prisma.setup.findFirst({
        where: { id: body.setupId, userId: user.id },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: "找不到這個 Setup" }, { status: 400 });
      }
      data.setupId = body.setupId;
    } else {
      return NextResponse.json({ error: "setupId 格式錯誤" }, { status: 400 });
    }
  }

  // 自訂欄位值:{ fieldId: value },value 為 null 表示清空
  const customValues =
    body.customValues && typeof body.customValues === "object"
      ? (body.customValues as Record<string, unknown>)
      : null;

  // 紀律檢查:{ ruleId: boolean },只接受目前使用者自己的規則
  const ruleChecks =
    body.ruleChecks && typeof body.ruleChecks === "object"
      ? (body.ruleChecks as Record<string, unknown>)
      : null;

  if (Object.keys(data).length === 0 && !customValues && !ruleChecks) {
    return NextResponse.json({ error: "沒有可更新的欄位" }, { status: 400 });
  }

  // 先確認這筆交易屬於這個使用者,後面的欄位值寫入才安全
  const owned = await prisma.trade.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true, direction: true, entryPrice: true, exitPrice: true, stopLossPrice: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "找不到這筆交易" }, { status: 404 });
  }

  // 止損價一變動,R 值要跟著重算——用這筆交易既有的進場/出場價,
  // 不需要使用者同時重填其他欄位。
  if ("stopLossPrice" in data) {
    const nextStopLoss = data.stopLossPrice ?? null;
    data.rMultiple = calcRMultiple(
      owned.direction,
      Number(owned.entryPrice),
      owned.exitPrice === null ? null : Number(owned.exitPrice),
      nextStopLoss,
    );
  }

  if (Object.keys(data).length > 0) {
    await prisma.trade.update({ where: { id: params.id }, data });
  }

  if (customValues) {
    // 只接受屬於這個使用者的欄位定義,避免寫入別人的 fieldId
    const ids = Object.keys(customValues);
    const defs = await prisma.customFieldDefinition.findMany({
      where: { id: { in: ids }, userId: user.id },
      select: { id: true },
    });
    const allowed = new Set(defs.map((d) => d.id));

    for (const [fieldId, value] of Object.entries(customValues)) {
      if (!allowed.has(fieldId)) continue;
      const isEmpty =
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);

      if (isEmpty) {
        await prisma.customFieldValue.deleteMany({
          where: { tradeId: params.id, fieldId },
        });
      } else {
        await prisma.customFieldValue.upsert({
          where: { tradeId_fieldId: { tradeId: params.id, fieldId } },
          update: { value: value as object },
          create: { tradeId: params.id, fieldId, value: value as object },
        });
      }
    }
  }

  if (ruleChecks) {
    const ids = Object.keys(ruleChecks);
    const rules = await prisma.disciplineRule.findMany({
      where: { id: { in: ids }, userId: user.id },
      select: { id: true },
    });
    const allowed = new Set(rules.map((r) => r.id));

    for (const [ruleId, value] of Object.entries(ruleChecks)) {
      if (!allowed.has(ruleId) || typeof value !== "boolean") continue;
      await prisma.tradeRuleCheck.upsert({
        where: { tradeId_ruleId: { tradeId: params.id, ruleId } },
        update: { checked: value },
        create: { tradeId: params.id, ruleId, checked: value },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
