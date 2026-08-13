import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 刪除規則。TradeRuleCheck 設了 onDelete: Cascade,既有交易對這條規則的
// 勾選紀錄會一併消失——這條規則本來就不再存在了,保留孤兒勾選沒有意義。
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const result = await prisma.disciplineRule.deleteMany({
    where: { id: params.id, userId: user.id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "找不到這條規則" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
