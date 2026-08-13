import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_GRADES = ["A", "B", "C", "D"];

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
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const data: { reflectionNote?: string | null; grade?: string | null } = {};

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

  // 自訂欄位值:{ fieldId: value },value 為 null 表示清空
  const customValues =
    body.customValues && typeof body.customValues === "object"
      ? (body.customValues as Record<string, unknown>)
      : null;

  if (Object.keys(data).length === 0 && !customValues) {
    return NextResponse.json({ error: "沒有可更新的欄位" }, { status: 400 });
  }

  // 先確認這筆交易屬於這個使用者,後面的欄位值寫入才安全
  const owned = await prisma.trade.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "找不到這筆交易" }, { status: 404 });
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

  return NextResponse.json({ ok: true });
}
