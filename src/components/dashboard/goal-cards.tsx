"use client";

// 對應 prototype 的「目標與風控」區塊(回撤緩衝量表 + 獲利目標進度條)。
// 量表刻意用簡單圓環,不做 PF 平台常見的指針式速度錶(見 design.md 第九節)。

export type GoalState = {
  lossLimitMode: "FIXED" | "PERCENT";
  dailyLossFixed: number | null;
  dailyLossPercent: number | null;
  totalCapital: number | null;
  profitTargetAmount: number | null;
};

function fmt(n: number, d = 1) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function Gauge({ pct, state }: { pct: number; state: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const stroke =
    state === "ok"
      ? "var(--profit)"
      : state === "warn"
        ? "var(--warning)"
        : "var(--loss)";
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth="9"
        opacity="0.5"
      />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={c.toFixed(1)}
        strokeDashoffset={offset.toFixed(1)}
      />
    </svg>
  );
}

function EmptyCard({
  title,
  detail,
  icon,
}: {
  title: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded border border-border bg-surface px-5 py-6 text-center">
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="mb-2 h-7 w-7 text-text-secondary opacity-60"
      >
        {icon}
      </svg>
      <div className="mb-0.5 text-[0.9rem] font-semibold text-text-secondary">
        {title}
      </div>
      <div className="text-[0.8rem] text-text-secondary">{detail}</div>
    </div>
  );
}

export function GoalCards({
  goals,
  todayLoss,
  monthPnl,
}: {
  // null:目前檢視範圍橫跨多個帳戶模板——目標與風控是每個模板各自設定的
  // (規劃書 5.5/Q23),不能硬合併成一組數字,誠實顯示「不適用」而不是
  // 空手套一個看起來像「尚未設定」的假狀態。
  goals: GoalState | null;
  todayLoss: number; // 今日已實現虧損(正值)
  monthPnl: number; // 本月累計損益
}) {
  if (goals === null) {
    return (
      <div className="mb-5 rounded border border-border bg-surface px-5 py-5 text-center text-[0.82rem] text-text-secondary">
        目標與風控是每個帳戶模板各自設定——切換到單一模板檢視才會顯示回撤緩衝與獲利目標。
      </div>
    );
  }

  const limit =
    goals.lossLimitMode === "PERCENT"
      ? (goals.totalCapital ?? 0) * ((goals.dailyLossPercent ?? 0) / 100)
      : (goals.dailyLossFixed ?? 0);
  const target = goals.profitTargetAmount ?? 0;

  const remainPct =
    limit > 0 ? Math.max(0, Math.min(100, (1 - todayLoss / limit) * 100)) : 0;
  const state = remainPct > 50 ? "ok" : remainPct > 25 ? "warn" : "danger";
  const stateText =
    state === "ok" ? "text-profit" : state === "warn" ? "text-warning" : "text-loss";

  const targetPct =
    target > 0 ? Math.max(0, Math.min(100, (monthPnl / target) * 100)) : 0;

  return (
    <div className="mb-5 grid grid-cols-2 gap-4">
      {limit > 0 ? (
        <div className="flex items-center gap-[18px] rounded border border-border bg-surface px-5 py-5">
          <div className="relative h-[104px] w-[104px] shrink-0">
            <Gauge pct={remainPct} state={state} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`num text-[1.1rem] font-semibold ${stateText}`}>
                {remainPct.toFixed(0)}%
              </span>
              <span className="text-[0.68rem] text-text-secondary">緩衝</span>
            </div>
          </div>
          <div>
            <div className="mb-1 text-[0.84rem] font-semibold">回撤緩衝</div>
            <div className="text-[0.78rem] leading-relaxed text-text-secondary">
              今日已虧損 <b className="num text-text">{fmt(todayLoss)}U</b> / 上限{" "}
              <b className="num text-text">{fmt(limit, 0)}U</b>
              {goals.lossLimitMode === "PERCENT" && (
                <span>
                  {" "}
                  (帳戶資金 {fmt(goals.totalCapital ?? 0, 0)}U 的{" "}
                  {goals.dailyLossPercent}%)
                </span>
              )}
              <br />
              距離每日虧損上限還有{" "}
              <b className="num text-text">{fmt(Math.max(0, limit - todayLoss))}U</b>
            </div>
          </div>
        </div>
      ) : (
        <EmptyCard
          title="尚未設定每日虧損上限"
          detail="前往設定 → 目標設定填寫,啟用回撤緩衝量表"
          icon={
            <>
              <circle cx="10" cy="10" r="7" />
              <line x1="10" y1="7" x2="10" y2="11" />
              <circle cx="10" cy="13.3" r="0.5" fill="currentColor" />
            </>
          }
        />
      )}

      {target > 0 ? (
        <div className="rounded border border-border bg-surface px-5 py-5">
          <div className="text-[0.84rem] font-semibold">獲利目標(本月)</div>
          <div className="my-2 h-2 overflow-hidden rounded-full border border-border bg-canvas">
            <div
              className={monthPnl >= 0 ? "h-full bg-profit" : "h-full bg-loss"}
              style={{ width: `${targetPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[0.78rem] text-text-secondary">
            <span className="num">
              {fmt(monthPnl)}U / {fmt(target, 0)}U
            </span>
            <span className="num">{targetPct.toFixed(0)}%</span>
          </div>
        </div>
      ) : (
        <EmptyCard
          title="尚未設定獲利目標"
          detail="前往設定 → 目標設定填寫,啟用獲利目標進度條"
          icon={<path d="M3 17V9M9 17V4M15 17v-6" />}
        />
      )}
    </div>
  );
}
