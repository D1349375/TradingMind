import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function num(v: unknown): number | null {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const goal = await prisma.goal.findUnique({ where: { userId: user.id } });
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
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });

  return NextResponse.json({ ok: true });
}
