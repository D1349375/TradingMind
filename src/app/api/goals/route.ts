import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedAccount } from "@/lib/accounts";
import { prisma } from "@/lib/prisma";

function num(v: unknown): number | null {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Goal 綁在帳戶模板底下(2026-08-16 起,規劃書 5.5/Q23)——不同模板的規模
// 與回撤規則不一樣,不能共用全域設定。
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const accountId = request.nextUrl.searchParams.get("accountId");
  if (!accountId || !(await getOwnedAccount(user.id, accountId))) {
    return NextResponse.json({ error: "找不到這個帳戶模板" }, { status: 404 });
  }

  const goal = await prisma.goal.findUnique({ where: { accountId } });
  if (!goal) {
    return NextResponse.json({
      lossLimitMode: "FIXED",
      dailyLossFixed: null,
      dailyLossPercent: null,
      totalCapital: null,
      profitTargetAmount: null,
    });
  }
  return NextResponse.json({
    lossLimitMode: goal.lossLimitMode,
    dailyLossFixed: goal.dailyLossFixed ? Number(goal.dailyLossFixed) : null,
    dailyLossPercent: goal.dailyLossPercent
      ? Number(goal.dailyLossPercent)
      : null,
    totalCapital: goal.totalCapital ? Number(goal.totalCapital) : null,
    profitTargetAmount: goal.profitTargetAmount
      ? Number(goal.profitTargetAmount)
      : null,
  });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  if (!accountId || !(await getOwnedAccount(user.id, accountId))) {
    return NextResponse.json({ error: "找不到這個帳戶模板" }, { status: 404 });
  }

  const mode = body.lossLimitMode === "PERCENT" ? "PERCENT" : "FIXED";
  const data = {
    lossLimitMode: mode as "FIXED" | "PERCENT",
    dailyLossFixed: num(body.dailyLossFixed),
    dailyLossPercent: num(body.dailyLossPercent),
    totalCapital: num(body.totalCapital),
    profitTargetAmount: num(body.profitTargetAmount),
  };

  if (data.dailyLossPercent !== null && data.dailyLossPercent > 100) {
    return NextResponse.json(
      { error: "每日虧損上限百分比不能超過 100%" },
      { status: 400 },
    );
  }

  await prisma.goal.upsert({
    where: { accountId },
    update: data,
    create: { accountId, ...data },
  });

  return NextResponse.json({ ok: true });
}
