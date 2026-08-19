import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const KINDS = ["LIVE", "DEMO", "PROP_FIRM"] as const;
const ASSET_CLASSES = ["CRYPTO", "FUTURES", "STOCK", "FOREX", "OPTIONS"] as const;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const accounts = await prisma.tradingAccount.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: {
      exchangeConnection: { select: { id: true, provider: true, lastSyncedAt: true } },
      goal: { select: { id: true } },
      _count: { select: { trades: true } },
    },
  });

  return NextResponse.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      label: a.label,
      kind: a.kind,
      assetClass: a.assetClass,
      hasExchangeConnection: !!a.exchangeConnection,
      exchangeProvider: a.exchangeConnection?.provider ?? null,
      lastSyncedAt: a.exchangeConnection?.lastSyncedAt ?? null,
      hasGoal: !!a.goal,
      tradeCount: a._count.trades,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "模板名稱不能空白" }, { status: 400 });
  }

  const kind = KINDS.includes(body.kind as (typeof KINDS)[number])
    ? (body.kind as (typeof KINDS)[number])
    : "LIVE";

  const assetClass = ASSET_CLASSES.includes(
    body.assetClass as (typeof ASSET_CLASSES)[number],
  )
    ? (body.assetClass as (typeof ASSET_CLASSES)[number])
    : null;

  const account = await prisma.tradingAccount.create({
    data: { userId: user.id, label, kind, assetClass },
  });

  return NextResponse.json({ account });
}
