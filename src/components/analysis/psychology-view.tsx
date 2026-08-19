"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeBehaviorAlerts,
  type BehaviorSetting,
} from "@/lib/behavior-detection";
import { DETECTION_DEFS } from "@/lib/behavior-presets";
import { disciplineComplianceRate } from "@/lib/stats";

// 對應 prototype 的心態分析頁。
//
// 情緒 × 損益需要自訂欄位的「情緒狀態」;沒有資料就誠實說明缺什麼、去哪裡設定,
// 不要顯示 0% 或假資料。

export type PsychTrade = {
  closedAt: string | null;
  openedAt: string | null;
  realizedPnl: number | null;
  positionSize: number | null;
  entryPrice: number | null;
  grade: string | null;
  emotion: string | null;
  ruleChecks: boolean[]; // 這筆交易上,每條「目前仍存在」的紀律規則被勾成什麼
};

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${fmt(n, d)}`;

export function PsychologyView({
  trades,
  hasEmotionField,
  ruleCount,
  behaviorSettings,
  totalCapital,
  showBybitHint,
}: {
  trades: PsychTrade[];
  hasEmotionField: boolean;
  ruleCount: number;
  behaviorSettings: BehaviorSetting[];
  totalCapital: number | null;
  showBybitHint: boolean;
}) {
  const stats = useMemo(() => {
    const settled = trades
      .filter(
        (t): t is PsychTrade & { closedAt: string; realizedPnl: number } =>
          t.closedAt !== null && t.realizedPnl !== null,
      )
      .sort((a, b) => a.closedAt.localeCompare(b.closedAt));

    // 最大連虧 / 連勝
    let curWin = 0,
      curLoss = 0,
      maxWin = 0,
      maxLoss = 0;
    for (const t of settled) {
      if (t.realizedPnl > 0) {
        curWin++;
        curLoss = 0;
        maxWin = Math.max(maxWin, curWin);
      } else if (t.realizedPnl < 0) {
        curLoss++;
        curWin = 0;
        maxLoss = Math.max(maxLoss, curLoss);
      }
    }

    // 評分分布(使用者自己打的,有資料才算)
    const graded = trades.filter((t) => t.grade);
    const byGrade = new Map<string, { n: number; pnl: number }>();
    for (const t of graded) {
      const g = t.grade as string;
      const prev = byGrade.get(g) ?? { n: 0, pnl: 0 };
      byGrade.set(g, {
        n: prev.n + 1,
        pnl: prev.pnl + (t.realizedPnl ?? 0),
      });
    }

    // 每日交易次數(本地時區),用來看有沒有過度交易的日子
    const perDay = new Map<string, number>();
    for (const t of settled) {
      const d = new Date(t.closedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    const counts = [...perDay.values()];
    const avgPerDay = counts.length
      ? counts.reduce((s, c) => s + c, 0) / counts.length
      : 0;
    const busiest = counts.length ? Math.max(...counts) : 0;

    // 情緒 × 損益
    const byEmotion = new Map<
      string,
      { n: number; wins: number; losses: number; pnl: number }
    >();
    for (const t of trades) {
      if (!t.emotion || t.realizedPnl === null) continue;
      const prev = byEmotion.get(t.emotion) ?? {
        n: 0,
        wins: 0,
        losses: 0,
        pnl: 0,
      };
      prev.n++;
      if (t.realizedPnl > 0) prev.wins++;
      else if (t.realizedPnl < 0) prev.losses++;
      prev.pnl += t.realizedPnl;
      byEmotion.set(t.emotion, prev);
    }

    // 紀律遵守率抽成共用函式(lib/stats.ts 的 disciplineComplianceRate),
    // 週期回顧功能也會用同一份邏輯,不留兩份重複計算。違規損益是這個畫面
    // 特有的延伸指標,留在這裡算。
    const marked = trades.filter((t) => t.ruleChecks.length > 0);
    const violated = marked.filter((t) => t.ruleChecks.some((c) => !c));
    const violationLoss = violated.reduce(
      (s, t) => s + Math.min(0, t.realizedPnl ?? 0),
      0,
    );
    const discipline = disciplineComplianceRate(trades);

    return {
      maxWinStreak: maxWin,
      maxLossStreak: maxLoss,
      emotionRows: [...byEmotion.entries()].sort((a, b) => b[1].pnl - a[1].pnl),
      disciplineMarked: discipline.marked,
      disciplineRate: discipline.rate,
      violationCount: violated.length,
      violationLoss,
      gradeRows: [...byGrade.entries()].sort((a, b) =>
        a[0].localeCompare(b[0]),
      ),
      gradedCount: graded.length,
      avgPerDay,
      busiest,
      tradingDays: counts.length,
    };
  }, [trades]);

  if (trades.length === 0) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-12 text-center">
        <div className="mb-1 text-[0.9rem] font-semibold text-text-secondary">
          還沒有交易資料
        </div>
        <p className="text-[0.82rem] text-text-secondary">
          {showBybitHint
            ? "同步 Bybit/OKX、CSV 匯入或手動新增交易後,這裡會依實際資料計算。"
            : "這個模板的資產類別跟目前支援自動同步的交易所(Bybit/OKX,僅限加密貨幣)對不上。用 CSV 匯入或手動新增交易後,這裡會依實際資料計算。"}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-4 gap-px overflow-hidden rounded border border-border bg-border">
        <Stat label="最大連續虧損" value={`${stats.maxLossStreak} 筆`} tone="loss" />
        <Stat label="最大連續獲利" value={`${stats.maxWinStreak} 筆`} tone="profit" />
        <Stat
          label="平均每日交易次數"
          value={stats.tradingDays ? fmt(stats.avgPerDay, 1) : "—"}
          hint={stats.tradingDays ? `共 ${stats.tradingDays} 個交易日` : undefined}
        />
        <Stat
          label="單日最多交易"
          value={stats.busiest ? `${stats.busiest} 筆` : "—"}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <Card title="紀律遵守率">
          {ruleCount === 0 ? (
            <NeedsSetup
              what="紀律規則"
              why="要先設定至少一條紀律規則,並在每筆交易的「紀律檢查」清單勾選是否符合。"
              where="設定 → 紀律規則"
            />
          ) : stats.disciplineMarked === 0 ? (
            <p className="text-[0.82rem] leading-relaxed text-text-secondary">
              紀律規則已設定,但還沒有交易勾選過。到交易記錄頁的「紀律檢查」清單標記後就會統計。
            </p>
          ) : (
            <div>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="num text-[1.5rem] font-semibold text-profit">
                  {fmt(stats.disciplineRate ?? 0, 1)}%
                </span>
                <span className="text-[0.78rem] text-text-secondary">
                  已標記 {stats.disciplineMarked} 筆
                </span>
              </div>
              <div className="text-[0.82rem] text-text-secondary">
                違規 <b className="num text-text">{stats.violationCount}</b> 筆,
                造成虧損{" "}
                <b className="num text-loss">
                  {fmt(stats.violationLoss)}U
                </b>
              </div>
            </div>
          )}
        </Card>

        <Card title="情緒 × 損益">
          {!hasEmotionField ? (
            <NeedsSetup
              what="情緒狀態欄位"
              why="要先在欄位庫啟用「情緒狀態」,並在每筆交易標記,才能交叉分析。"
              where="設定 → 欄位自訂"
            />
          ) : stats.emotionRows.length === 0 ? (
            <p className="text-[0.82rem] leading-relaxed text-text-secondary">
              「情緒狀態」欄位已啟用,但還沒有交易標記。到交易記錄頁的「自訂欄位」分頁標記後就會統計。
            </p>
          ) : (
            <table className="w-full border-collapse text-[0.87rem]">
              <thead>
                <tr>
                  {["情緒", "筆數", "勝率", "累計損益"].map((h, i) => (
                    <th
                      key={h}
                      className={`border-b border-border px-2 py-1.5 text-[0.75rem] font-semibold text-text-secondary ${
                        i === 0 ? "text-left" : "text-right"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.emotionRows.map(([e, v]) => {
                  const decided = v.wins + v.losses;
                  return (
                    <tr key={e}>
                      <td className="border-b border-border px-2 py-1.5">{e}</td>
                      <td className="num border-b border-border px-2 py-1.5 text-right">
                        {v.n}
                      </td>
                      <td className="num border-b border-border px-2 py-1.5 text-right">
                        {decided
                          ? `${fmt((v.wins / decided) * 100, 0)}%`
                          : "—"}
                      </td>
                      <td
                        className={`num border-b border-border px-2 py-1.5 text-right font-semibold ${
                          v.pnl >= 0 ? "text-profit" : "text-loss"
                        }`}
                      >
                        {signed(v.pnl)}U
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {stats.emotionRows.some(([, v]) => v.n < 5) && (
            <p className="mt-2 text-[0.72rem] leading-relaxed text-text-tertiary">
              筆數少於 5 的情緒只是少數樣本,單筆大賺大賠就會主導結果,
              別急著據此下結論。情緒是自己標的,回頭補標時容易受結果影響——
              當下就標比較準。
            </p>
          )}
        </Card>
      </div>

      <BehaviorDetectionCard
        trades={trades}
        behaviorSettings={behaviorSettings}
        totalCapital={totalCapital}
      />

      <div className="rounded border border-border bg-surface px-4 py-4">
        <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">
          交易評分分布
        </h3>
        {stats.gradedCount === 0 ? (
          <p className="text-[0.82rem] leading-relaxed text-text-secondary">
            還沒有交易被評分。到交易記錄頁的「總覽」分頁替交易打 A/B/C/D,
            這裡就會顯示各評分的筆數與損益貢獻。
          </p>
        ) : (
          <table className="w-full border-collapse text-[0.9rem]">
            <thead>
              <tr>
                {["評分", "交易數", "累計損益"].map((h, i) => (
                  <th
                    key={h}
                    className={`border-b border-border px-2.5 py-1.5 text-[0.78rem] font-semibold text-text-secondary ${
                      i === 0 ? "text-left" : "text-right"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.gradeRows.map(([g, v]) => (
                <tr key={g}>
                  <td className="border-b border-border px-2.5 py-2 font-semibold">
                    {g}
                  </td>
                  <td className="num border-b border-border px-2.5 py-2 text-right">
                    {v.n}
                  </td>
                  <td
                    className={`num border-b border-border px-2.5 py-2 text-right font-semibold ${
                      v.pnl >= 0 ? "text-profit" : "text-loss"
                    }`}
                  >
                    {signed(v.pnl)}U
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss";
  hint?: string;
}) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <div className="mb-1.5 text-[0.78rem] text-text-secondary">{label}</div>
      <div
        className={`num text-[1.29rem] font-semibold ${
          tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : ""
        }`}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[0.7rem] text-text-tertiary">{hint}</div>
      )}
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border bg-surface px-4 py-4">
      <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">
        {title}
      </h3>
      {children}
    </div>
  );
}

// 「上頭偵測」按本地日曆日分組,伺服器與瀏覽器時區不同會誤判——
// 跟 Dashboard 的日曆卡同一個理由,整張卡延後到掛載後才計算與顯示。
function BehaviorDetectionCard({
  trades,
  behaviorSettings,
  totalCapital,
}: {
  trades: PsychTrade[];
  behaviorSettings: BehaviorSetting[];
  totalCapital: number | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const results = useMemo(
    () =>
      mounted
        ? computeBehaviorAlerts(trades, behaviorSettings, totalCapital)
        : [],
    [mounted, trades, behaviorSettings, totalCapital],
  );

  return (
    <div className="mb-4 rounded border border-border bg-surface px-4 py-4">
      <h3 className="mb-3 text-[0.82rem] font-semibold text-text-secondary">
        行為偵測
      </h3>
      {!mounted ? (
        <p className="text-[0.82rem] text-text-secondary">計算中…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {DETECTION_DEFS.map((def) => {
            const r = results.find((x) => x.kind === def.kind);
            if (!r) return null;
            return (
              <div
                key={def.kind}
                className={`rounded border px-3 py-2.5 ${
                  r.enabled ? "border-border bg-canvas" : "border-dashed border-border bg-canvas opacity-60"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[0.84rem] font-semibold">{def.label}</span>
                  {!r.enabled && (
                    <span className="text-[0.68rem] text-text-tertiary">未啟用</span>
                  )}
                </div>
                {!r.available ? (
                  <p className="text-[0.76rem] leading-relaxed text-text-tertiary">
                    {r.unavailableReason}
                  </p>
                ) : (
                  <>
                    <div
                      className={`num text-[1.1rem] font-semibold ${
                        r.count > 0 ? "text-loss" : "text-text"
                      }`}
                    >
                      {r.count} 次
                    </div>
                    {r.sample.length > 0 && (
                      <div className="mt-0.5 text-[0.72rem] text-text-tertiary">
                        {r.sample.join(" · ")}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[0.72rem] text-text-tertiary">
        閾值可到「設定 → 行為偵測」調整;是你自己定義什麼叫「上頭」,系統不代為判斷。
      </p>
    </div>
  );
}

function NeedsSetup({
  what,
  why,
  where,
}: {
  what: string;
  why: string;
  where: string;
}) {
  return (
    <div className="rounded border border-dashed border-border bg-canvas px-3.5 py-3.5">
      <div className="mb-1 text-[0.85rem] font-semibold text-text-secondary">
        需要先設定{what}
      </div>
      <p className="mb-1.5 text-[0.8rem] leading-relaxed text-text-secondary">
        {why}
      </p>
      <p className="text-[0.75rem] text-text-tertiary">{where}</p>
    </div>
  );
}
