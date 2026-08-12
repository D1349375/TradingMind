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

  let body: { reflectionNote?: unknown; grade?: unknown };
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

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "沒有可更新的欄位" }, { status: 400 });
  }

  // 用 updateMany 綁 userId,避免改到別人的交易
  const result = await prisma.trade.updateMany({
    where: { id: params.id, userId: user.id },
    data,
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "找不到這筆交易" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
