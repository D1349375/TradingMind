import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TradesView, type TradeDto } from "@/components/trades/trades-view";
import { AddTradeForm } from "@/components/trades/add-trade-form";

export const metadata: Metadata = {
  title: "交易記錄 · TradeMind",
};

export default async function TradesPage() {
  const user = await getCurrentUser();

  // 目前一次載入全部。筆數變多之後要改成分頁或虛擬捲動,
  // 現階段(數十筆)這樣最單純。
  const [rows, fieldDefs, setups, rules] = await Promise.all([
    prisma.trade.findMany({
      where: { userId: user!.id },
      orderBy: { closedAt: "desc" },
      include: {
        customValues: { select: { fieldId: true, value: true } },
        ruleChecks: { select: { ruleId: true, checked: true } },
      },
    }),
    prisma.customFieldDefinition.findMany({
      where: { userId: user!.id },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.setup.findMany({
      where: { userId: user!.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.disciplineRule.findMany({
      where: { userId: user!.id, active: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const fields = fieldDefs.map((f) => ({
    id: f.id,
    key: f.key,
    label: f.label,
    fieldType: f.fieldType,
    options: (f.options as string[] | null) ?? null,
  }));

  // Decimal 與 Date 不能直接傳給 client component,轉成字串
  const trades: TradeDto[] = rows.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    direction: t.direction,
    openedAt: t.openedAt?.toISOString() ?? null,
    closedAt: t.closedAt?.toISOString() ?? null,
    entryPrice: t.entryPrice.toString(),
    exitPrice: t.exitPrice?.toString() ?? null,
    positionSize: t.positionSize.toString(),
    leverage: t.leverage?.toString() ?? null,
    fee: t.fee.toString(),
    realizedPnl: t.realizedPnl?.toString() ?? null,
    rMultiple: t.rMultiple?.toString() ?? null,
    grade: t.grade,
    reflectionNote: t.reflectionNote,
    source: t.source,
    customValues: Object.fromEntries(
      t.customValues.map((v) => [v.fieldId, v.value]),
    ),
    setupId: t.setupId,
    ruleChecks: Object.fromEntries(
      t.ruleChecks.map((c) => [c.ruleId, c.checked]),
    ),
  }));

  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[1.4rem] font-semibold">交易記錄</h1>
            <p className="mt-0.5 text-[0.84rem] text-text-secondary">
              自動同步 + 手動補充欄位 · 共 {trades.length} 筆
            </p>
          </div>
          <AddTradeForm />
        </div>
        <TradesView
          trades={trades}
          fields={fields}
          setups={setups.map((s) => ({
            id: s.id,
            name: s.name,
            entryLogic: s.entryLogic,
            economicRationale: s.economicRationale,
          }))}
          rules={rules.map((r) => ({ id: r.id, label: r.label }))}
        />
      </div>
    </div>
  );
}
