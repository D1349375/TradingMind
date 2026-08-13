import type { DetectionKind } from "@/lib/behavior-presets";

export type BehaviorTrade = {
  closedAt: string | null;
  openedAt: string | null;
  realizedPnl: number | null;
  positionSize: number | null;
  entryPrice: number | null;
};

export type BehaviorSetting = {
  kind: DetectionKind;
  enabled: boolean;
  threshold: Record<string, number>;
};

export type DetectionOutcome = {
  kind: DetectionKind;
  enabled: boolean;
  available: boolean;
  unavailableReason?: string;
  count: number;
  sample: string[];
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// 依已知資料限制誠實計算,算不出來就說明缺什麼,不要用假設值頂替
// (呼應 lib/stats.ts 對「算不出來的指標」的處理原則)。
export function computeBehaviorAlerts(
  trades: BehaviorTrade[],
  settings: BehaviorSetting[],
  totalCapital: number | null,
): DetectionOutcome[] {
  const settled = trades
    .filter(
      (t): t is BehaviorTrade & { closedAt: string; realizedPnl: number } =>
        t.closedAt !== null && t.realizedPnl !== null,
    )
    .sort((a, b) => a.closedAt.localeCompare(b.closedAt));

  const settingOf = (k: DetectionKind) =>
    settings.find((s) => s.kind === k) ?? { kind: k, enabled: false, threshold: {} };

  const results: DetectionOutcome[] = [];

  // ---- 復仇交易:虧損後 N 分鐘內開倉超過平常 M 倍倉位 ----
  {
    const s = settingOf("REVENGE_TRADING");
    const windowMinutes = s.threshold.windowMinutes ?? 10;
    const sizeMultiplier = s.threshold.sizeMultiplier ?? 2;
    const withOpen = settled.filter((t) => t.openedAt !== null);
    if (withOpen.length < 2) {
      results.push({
        kind: "REVENGE_TRADING",
        enabled: s.enabled,
        available: false,
        unavailableReason:
          "需要開倉時間,但目前交易多由 Bybit 同步且該端點不提供開倉時間(見交易記錄「持倉時間」欄位說明)。手動或 CSV 匯入的交易若填了開倉時間,會被納入計算。",
        count: 0,
        sample: [],
      });
    } else {
      const avgSize =
        withOpen.reduce((sum, t) => sum + (t.positionSize ?? 0), 0) /
        withOpen.length;
      const sample: string[] = [];
      let count = 0;
      for (let i = 1; i < settled.length; i++) {
        const prev = settled[i - 1];
        const cur = settled[i];
        if (prev.realizedPnl >= 0 || cur.openedAt === null) continue;
        const gapMin =
          (new Date(cur.openedAt).getTime() - new Date(prev.closedAt).getTime()) /
          60000;
        if (gapMin < 0 || gapMin > windowMinutes) continue;
        if ((cur.positionSize ?? 0) <= avgSize * sizeMultiplier) continue;
        count++;
        if (sample.length < 3) sample.push(fmtDate(cur.closedAt));
      }
      results.push({
        kind: "REVENGE_TRADING",
        enabled: s.enabled,
        available: true,
        count,
        sample,
      });
    }
  }

  // ---- 上頭偵測:單日交易次數超過平均的 N 倍 ----
  {
    const s = settingOf("TILT_OVERTRADING");
    const multiplier = s.threshold.multiplier ?? 2;
    const perDay = new Map<string, { key: string; n: number }>();
    for (const t of settled) {
      const k = dayKey(t.closedAt);
      const cur = perDay.get(k) ?? { key: t.closedAt, n: 0 };
      cur.n++;
      perDay.set(k, cur);
    }
    const days = [...perDay.values()];
    if (days.length < 5) {
      results.push({
        kind: "TILT_OVERTRADING",
        enabled: s.enabled,
        available: false,
        unavailableReason: `目前只有 ${days.length} 個交易日的資料,樣本太少算不出有意義的平均值,至少需要 5 個交易日。`,
        count: 0,
        sample: [],
      });
    } else {
      const avg = days.reduce((s2, d) => s2 + d.n, 0) / days.length;
      const flagged = days.filter((d) => d.n > avg * multiplier);
      results.push({
        kind: "TILT_OVERTRADING",
        enabled: s.enabled,
        available: true,
        count: flagged.length,
        sample: flagged.slice(0, 3).map((d) => `${fmtDate(d.key)}(${d.n} 筆)`),
      });
    }
  }

  // ---- 連續虧損:連續 N 筆虧損時提醒(只在剛達門檻那一刻算一次) ----
  {
    const s = settingOf("LOSING_STREAK");
    const count = s.threshold.count ?? 3;
    let streak = 0;
    let flaggedCount = 0;
    const sample: string[] = [];
    for (const t of settled) {
      if (t.realizedPnl < 0) {
        streak++;
        if (streak === count) {
          flaggedCount++;
          if (sample.length < 3) sample.push(fmtDate(t.closedAt));
        }
      } else {
        streak = 0;
      }
    }
    results.push({
      kind: "LOSING_STREAK",
      enabled: s.enabled,
      available: true,
      count: flaggedCount,
      sample,
    });
  }

  // ---- 單筆風險超標:倉位名目價值超過帳戶 N% ----
  {
    const s = settingOf("OVERSIZED_RISK");
    const percent = s.threshold.percent ?? 5;
    if (!totalCapital || totalCapital <= 0) {
      results.push({
        kind: "OVERSIZED_RISK",
        enabled: s.enabled,
        available: false,
        unavailableReason: "需要先在「設定 → 目標設定」填寫帳戶總資金才能算出比例。",
        count: 0,
        sample: [],
      });
    } else {
      const sample: string[] = [];
      let count = 0;
      for (const t of settled) {
        if (t.positionSize === null || t.entryPrice === null) continue;
        const notional = t.positionSize * t.entryPrice;
        const pct = (notional / totalCapital) * 100;
        if (pct > percent) {
          count++;
          if (sample.length < 3) sample.push(`${fmtDate(t.closedAt)}(${pct.toFixed(0)}%)`);
        }
      }
      results.push({
        kind: "OVERSIZED_RISK",
        enabled: s.enabled,
        available: true,
        count,
        sample,
      });
    }
  }

  return results;
}
