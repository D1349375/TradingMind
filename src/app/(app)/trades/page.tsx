import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAccountScope } from "@/lib/account-filter";
import { resolveTradeVisibilityCutoff } from "@/lib/tier-limits";
import { TradesView, type TradeDto } from "@/components/trades/trades-view";
import { AddTradeForm } from "@/components/trades/add-trade-form";
import { ImportCsvForm } from "@/components/trades/import-csv-form";

export const metadata: Metadata = {
  title: "交易記錄 · TradeMind",
};

export default async function TradesPage() {
  const user = await getCurrentUser();
  const scope = await resolveAccountScope(user!.id, user!.subscriptionTier);
  const cutoff = await resolveTradeVisibilityCutoff(user!.id, user!.subscriptionTier);

  // 目前一次載入全部。筆數變多之後要改成分頁或虛擬捲動,
  // 現階段(數十筆)這樣最單純。
  const [rows, hiddenCount, fieldDefs, setups, rules] = await Promise.all([
    prisma.trade.findMany({
      // 沒有主動篩選時不加 accountId 條件,才會包含模板被刪除後留下的
      // 「未分類」交易(accountId=null)——見 lib/page-cache.ts 開頭說明。
      where: {
        userId: user!.id,
        accountId: scope.isFiltered ? { in: scope.accountIds } : undefined,
        closedAt: cutoff ? { gte: cutoff } : undefined,
      },
      orderBy: { closedAt: "desc" },
      include: {
        customValues: { select: { fieldId: true, value: true } },
        ruleChecks: { select: { ruleId: true, checked: true } },
      },
    }),
    // FREE 方案被藏起來的筆數——同步/匯入照常寫入資料庫,只是查詢範圍
    // 被擋住(見 lib/tier-limits.ts),這裡算出來給使用者一個明確交代,
    // 不能悄悄消失不解釋。
    cutoff
      ? prisma.trade.count({
          where: {
            userId: user!.id,
            accountId: scope.isFiltered ? { in: scope.accountIds } : undefined,
            closedAt: { lt: cutoff },
          },
        })
      : Promise.resolve(0),
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
    stopLossPrice: t.stopLossPrice?.toString() ?? null,
    takeProfitPrice: t.takeProfitPrice?.toString() ?? null,
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
    // 這頁刻意不套 max-w-[1180px] 那個跟其他頁面共用的置中容器——交易記錄頁
    // 的重點是可拖曳的列表/詳情面板,面板自己管寬度,外層再限制寬度只會讓
    // 使用者拖了也白拖(2026-08-14,回應「紀錄介面太小」的問題)。
    <div className="px-9 py-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h1 className="flex items-baseline gap-2 text-[1.25rem] font-semibold">
          交易記錄
          <span className="text-[0.8rem] font-normal text-text-secondary">
            共 {trades.length} 筆
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <ImportCsvForm />
          <AddTradeForm />
        </div>
      </div>
      {hiddenCount > 0 && (
        <div className="mb-3 rounded border border-warning bg-warning-bg px-3 py-2 text-[0.8rem] leading-relaxed text-warning">
          FREE 方案只能查看最近 {trades.length} 筆交易,還有 {hiddenCount}{" "}
          筆更早的交易已經記錄在系統裡(不會遺失),
          <a href="/settings?tab=subscription" className="underline">
            升級訂閱方案
          </a>{" "}
          即可查看完整紀錄。
        </div>
      )}
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
  );
}
