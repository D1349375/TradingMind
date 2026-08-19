import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOwnedAccount } from "@/lib/accounts";
import { prisma } from "@/lib/prisma";

const KINDS = ["LIVE", "DEMO", "PROP_FIRM"] as const;
const ASSET_CLASSES = ["CRYPTO", "FUTURES", "STOCK", "FOREX", "OPTIONS"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const existing = await getOwnedAccount(user.id, params.id);
  if (!existing) {
    return NextResponse.json({ error: "找不到這個帳戶模板" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const data: { label?: string; kind?: (typeof KINDS)[number]; assetClass?: (typeof ASSET_CLASSES)[number] | null } = {};

  if (typeof body.label === "string") {
    const label = body.label.trim();
    if (!label) {
      return NextResponse.json({ error: "模板名稱不能空白" }, { status: 400 });
    }
    data.label = label;
  }
  if (typeof body.kind === "string" && KINDS.includes(body.kind as (typeof KINDS)[number])) {
    data.kind = body.kind as (typeof KINDS)[number];
  }
  if ("assetClass" in body) {
    data.assetClass = ASSET_CLASSES.includes(
      body.assetClass as (typeof ASSET_CLASSES)[number],
    )
      ? (body.assetClass as (typeof ASSET_CLASSES)[number])
      : null;
  }

  const account = await prisma.tradingAccount.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ account });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const existing = await getOwnedAccount(user.id, params.id);
  if (!existing) {
    return NextResponse.json({ error: "找不到這個帳戶模板" }, { status: 404 });
  }

  // 至少保留一個模板——手動新增交易/CSV匯入/分析頁篩選器都假設使用者
  // 名下永遠有帳戶可歸屬,刪到 0 個會讓這些地方無所適從。
  const total = await prisma.tradingAccount.count({ where: { userId: user.id } });
  if (total <= 1) {
    return NextResponse.json(
      { error: "至少要保留一個帳戶模板" },
      { status: 400 },
    );
  }

  // ExchangeConnection/Goal 是 onDelete: Cascade 會一併刪除;Trade.accountId
  // 是 onDelete: SetNull,底下的交易會變成未分類,不會被刪除。
  await prisma.tradingAccount.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
