// Setup 實盤衰退監測,改寫自 skills/quant skill/scripts/deployment_monitoring.py
// 的 cusum_decay_alarm()。原始設計是「回測 OOS 期望值 vs 上線後實際報酬」,
// 這裡沒有回測,改成「這個 Setup 自己前半段交易(基準期) vs 後半段交易
// (監測期)」——用它自己的歷史當基準,不是跟其他 Setup 比較。
//
// 只偵測「均值往下顯著漂移」,單邊 CUSUM。k(容忍度)/h(警報門檻)都用
// 原始文件建議的預設值(0.5 / 4 個標準差),不是資料驅動校正過的門檻,
// 顯示時要清楚說明這一點。
export type CusumResult = {
  available: boolean;
  unavailableReason?: string;
  alarm: boolean;
  baselineSize: number;
  monitoredSize: number;
};

const MIN_TOTAL = 20; // 少於這個數,基準期/監測期都會太小,不拆分
const MIN_SEGMENT = 8; // 每段至少要有這麼多筆才有意義

export function cusumSetupDecay(
  trades: { realizedPnl: number | null; closedAt: string | null }[],
  totalCapital: number | null,
  opts: { k?: number; h?: number } = {},
): CusumResult {
  if (!totalCapital || totalCapital <= 0) {
    return {
      available: false,
      unavailableReason: "需要先在「設定 → 目標設定」填寫帳戶總資金,才能把損益換算成報酬率監測。",
      alarm: false,
      baselineSize: 0,
      monitoredSize: 0,
    };
  }

  const sorted = trades
    .filter(
      (t): t is { realizedPnl: number; closedAt: string } =>
        t.realizedPnl !== null && t.closedAt !== null,
    )
    .sort((a, b) => a.closedAt.localeCompare(b.closedAt));

  if (sorted.length < MIN_TOTAL) {
    return {
      available: false,
      unavailableReason: `目前只有 ${sorted.length} 筆交易,樣本太少(建議至少 ${MIN_TOTAL} 筆)——要拆成基準期跟監測期兩段各自都要有足夠樣本,現在拆了也不可靠。`,
      alarm: false,
      baselineSize: 0,
      monitoredSize: 0,
    };
  }

  const returns = sorted.map((t) => t.realizedPnl / totalCapital);
  const splitAt = Math.floor(returns.length / 2);
  const baseline = returns.slice(0, splitAt);
  const monitored = returns.slice(splitAt);

  if (baseline.length < MIN_SEGMENT || monitored.length < MIN_SEGMENT) {
    return {
      available: false,
      unavailableReason: `樣本拆成基準期(${baseline.length}筆)跟監測期(${monitored.length}筆)後,其中一段少於 ${MIN_SEGMENT} 筆,還不夠可靠。`,
      alarm: false,
      baselineSize: baseline.length,
      monitoredSize: monitored.length,
    };
  }

  const mean = baseline.reduce((s, v) => s + v, 0) / baseline.length;
  const variance =
    baseline.reduce((s, v) => s + (v - mean) ** 2, 0) / (baseline.length - 1);
  const std = Math.sqrt(variance);

  // 用相對於均值量級的門檻,不是絕對值 0——完全沒波動時浮點運算殘留的
  // 極小誤差(例如 1e-18)會通過 `std <= 0`,但拿去除 z 分數會把雜訊放大成
  // 假警報(已用固定值 30 的假資料測出這個問題,不是假設性風險)。
  const scale = Math.max(Math.abs(mean), 1e-9);
  if (!Number.isFinite(std) || std < scale * 1e-6) {
    return {
      available: false,
      unavailableReason: "基準期報酬幾乎沒有波動,無法建立有意義的比較基準。",
      alarm: false,
      baselineSize: baseline.length,
      monitoredSize: monitored.length,
    };
  }

  const k = opts.k ?? 0.5;
  const h = opts.h ?? 4;

  let cusum = 0;
  let alarm = false;
  for (const r of monitored) {
    const z = (r - mean) / std;
    cusum = Math.min(0, cusum + z + k);
    if (cusum <= -h) {
      alarm = true;
      break;
    }
  }

  return {
    available: true,
    alarm,
    baselineSize: baseline.length,
    monitoredSize: monitored.length,
  };
}
