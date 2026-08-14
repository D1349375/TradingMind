"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sampleTier, SAMPLE_TIER_LABEL } from "@/lib/stats";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { cusumSetupDecay } from "@/lib/cusum";
import {
  probabilisticSharpeRatio,
  deflatedSharpeRatio,
  signPermutationTest,
} from "@/lib/quant-validation";

export type SetupWithTrades = {
  id: string;
  name: string;
  entryLogic: string | null;
  economicRationale: string | null;
  registered: boolean;
  trades: { realizedPnl: number | null; rMultiple: number | null; closedAt: string | null }[];
};

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
const signed = (n: number, d = 2) => `${n >= 0 ? "+" : ""}${fmt(n, d)}`;

function stats(trades: SetupWithTrades["trades"]) {
  const pnls = trades.map((t) => t.realizedPnl).filter((p): p is number => p !== null);
  const wins = pnls.filter((p) => p > 0).length;
  const losses = pnls.filter((p) => p < 0).length;
  const rs = trades.map((t) => t.rMultiple).filter((r): r is number => r !== null);
  return {
    n: trades.length,
    winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
    avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
    pnl: pnls.reduce((s, p) => s + p, 0),
  };
}

export type ValidationResult = {
  psr: number;
  dsr: number | null; // null 代表符合門檻的 Setup 只有一個,還沒有真正在做多重比較校正
  mcptPValue: number;
  nTrials: number;
  sampleSize: number;
};

// PSR/DSR/MCPT 要在「所有已登記 Setup」的層級一次算完(DSR 需要知道總共比較
// 了幾個 Setup、彼此 Sharpe 的離散程度),不能每張卡片各自獨立算。
// 門檻:要有帳戶總資金(換算報酬率)+ 單一 Setup 至少 20 筆交易。
function computeSetupValidation(
  registered: { setup: SetupWithTrades }[],
  totalCapital: number | null,
): Map<string, ValidationResult> {
  const result = new Map<string, ValidationResult>();
  if (!totalCapital || totalCapital <= 0) return result;

  const eligible: { id: string; returns: number[]; sharpe: number }[] = [];
  for (const { setup } of registered) {
    const returns = setup.trades
      .map((t) => t.realizedPnl)
      .filter((p): p is number => p !== null)
      .map((p) => p / totalCapital);
    if (returns.length < 20) continue;
    const psrResult = probabilisticSharpeRatio(returns);
    if (!psrResult) continue;
    eligible.push({ id: setup.id, returns, sharpe: psrResult.sharpe });
  }
  if (eligible.length === 0) return result;

  const nTrials = eligible.length;
  const sharpeMean = eligible.reduce((s, e) => s + e.sharpe, 0) / nTrials;
  const sharpeStd =
    nTrials > 1
      ? Math.sqrt(
          eligible.reduce((s, e) => s + (e.sharpe - sharpeMean) ** 2, 0) / (nTrials - 1),
        )
      : 0;

  for (const e of eligible) {
    const psrResult = probabilisticSharpeRatio(e.returns);
    const dsrResult = nTrials >= 2 ? deflatedSharpeRatio(e.returns, nTrials, sharpeStd) : null;
    const mcpt = signPermutationTest(e.returns);
    if (!psrResult || !mcpt) continue;
    result.set(e.id, {
      psr: psrResult.psr,
      dsr: dsrResult ? dsrResult.dsr : null,
      mcptPValue: mcpt.pValue,
      nTrials,
      sampleSize: e.returns.length,
    });
  }
  return result;
}

// 已登記的 Setup(填過經濟機制)才進 Playbook 排行比較——沒登記的只是
// 假設清單,拿來跟已驗證的排在一起比較沒有意義。見 schema 的 Setup 註解。
export function PlaybookView({
  setups,
  totalCapital,
}: {
  setups: SetupWithTrades[];
  totalCapital: number | null;
}) {
  const registered = setups
    .filter((s) => s.registered)
    .map((s) => ({ setup: s, stats: stats(s.trades) }))
    .sort((a, b) => b.stats.pnl - a.stats.pnl);
  const unregistered = setups.filter((s) => !s.registered);
  const validation = useMemo(
    () => computeSetupValidation(registered, totalCapital),
    [registered, totalCapital],
  );

  if (setups.length === 0) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-12 text-center">
        <div className="mb-1 text-[0.9rem] font-semibold text-text-secondary">
          還沒有任何 Setup
        </div>
        <p className="mx-auto max-w-[46ch] text-[0.82rem] text-text-secondary">
          到交易記錄頁的交易詳情,用「+ 標記 Setup」建立你的第一個進場邏輯。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2.5 flex items-center gap-1.5">
          <h2 className="text-[0.82rem] font-semibold text-text-secondary">
            已登記 Setup 排行
          </h2>
          <HelpTooltip>
            依累計損益排序,不是校正過「多重比較」的信心分數——測的 Setup 越多,排第一名光靠運氣的機率也越高。目前只用交易數做粗略的樣本量分級提醒,完整的統計驗證(PSR/DSR/PBO)還沒接進來。
          </HelpTooltip>
        </div>
        {registered.length === 0 ? (
          <div className="rounded border border-dashed border-border bg-surface px-5 py-8 text-center text-[0.82rem] text-text-secondary">
            還沒有任何 Setup 填過「經濟機制」,不會出現在排行——見下方「尚未登記」清單。
          </div>
        ) : (
          <div className="space-y-2.5">
            {registered.map(({ setup, stats: s }) => (
              <SetupCard
                key={setup.id}
                setup={setup}
                stats={s}
                totalCapital={totalCapital}
                validation={validation.get(setup.id) ?? null}
              />
            ))}
          </div>
        )}
      </section>

      {unregistered.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[0.82rem] font-semibold text-text-secondary">
            尚未登記(缺經濟機制,不進排行)
          </h2>
          <div className="space-y-2.5">
            {unregistered.map((setup) => (
              <SetupCard
                key={setup.id}
                setup={setup}
                stats={stats(setup.trades)}
                totalCapital={totalCapital}
                validation={null}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SetupCard({
  setup,
  stats: s,
  totalCapital,
  validation,
}: {
  setup: SetupWithTrades;
  stats: ReturnType<typeof stats>;
  totalCapital: number | null;
  validation: ValidationResult | null;
}) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const tier = sampleTier(s.n);
  const decay = setup.registered ? cusumSetupDecay(setup.trades, totalCapital) : null;

  if (editing) {
    return <SetupEditForm setup={setup} onDone={() => setEditing(false)} />;
  }

  async function remove() {
    const ok = window.confirm(
      `刪除 Setup「${setup.name}」?已標記這個 Setup 的交易不會被刪除,只是取消標記。`,
    );
    if (!ok) return;
    const res = await fetch(`/api/setups/${setup.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="rounded border border-border bg-surface px-4 py-3.5">
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.94rem] font-semibold">{setup.name}</div>
          {setup.entryLogic && (
            <div className="mt-0.5 text-[0.8rem] text-text-secondary">
              {setup.entryLogic}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-border px-2.5 py-1 text-[0.76rem] text-text-secondary hover:border-accent hover:text-accent"
          >
            編輯
          </button>
          <button
            type="button"
            onClick={remove}
            className="rounded border border-border px-2.5 py-1 text-[0.76rem] text-text-secondary hover:border-loss hover:text-loss"
          >
            刪除
          </button>
        </div>
      </div>

      {setup.economicRationale ? (
        <p className="mb-2.5 text-[0.8rem] italic leading-relaxed text-text-secondary">
          {setup.economicRationale}
        </p>
      ) : (
        <p className="mb-2.5 text-[0.78rem] text-text-tertiary">
          還沒填經濟機制——說明為什麼這個模式會重複出現,填了才算已登記。
        </p>
      )}

      {tier !== "sufficient" && (
        <p className="mb-2 text-[0.72rem] text-text-tertiary">{SAMPLE_TIER_LABEL[tier]}</p>
      )}
      <div className="grid grid-cols-4 gap-3">
        {[
          { l: "交易數", v: String(s.n) },
          { l: "勝率", v: s.winRate === null ? "—" : `${fmt(s.winRate, 1)}%` },
          { l: "平均 R", v: s.avgR === null ? "—" : `${fmt(s.avgR)}R` },
        ].map((m) => (
          <div key={m.l}>
            <div className="text-[0.72rem] text-text-secondary">{m.l}</div>
            <div className="num text-[0.92rem] font-semibold">{m.v}</div>
          </div>
        ))}
        <div>
          <div className="text-[0.72rem] text-text-secondary">累計損益</div>
          <div className={`num text-[0.92rem] font-semibold ${s.pnl >= 0 ? "text-profit" : "text-loss"}`}>
            {s.n > 0 ? `${signed(s.pnl)}U` : "—"}
          </div>
        </div>
      </div>

      {decay && (
        <div className="mt-2.5 flex items-start gap-1.5 border-t border-border pt-2.5">
          <span className="pt-0.5 text-[0.72rem] font-semibold text-text-secondary">
            衰退監測
          </span>
          <HelpTooltip>
            把這個 Setup 的交易依時間對半拆:前半段當基準期、後半段當監測期,用單邊 CUSUM 檢定後半段報酬有沒有顯著低於前半段——用它自己的歷史當基準,不是跟其他 Setup 比較,也不是正式的統計顯著性以外的保證。k/h 參數用業界常見預設值(0.5/4 個標準差),沒有針對你的資料校正過。
          </HelpTooltip>
          {!decay.available ? (
            <span className="text-[0.76rem] text-text-tertiary">{decay.unavailableReason}</span>
          ) : decay.alarm ? (
            <span className="text-[0.76rem] font-semibold text-loss">
              近期表現顯著低於基準期(基準 {decay.baselineSize} 筆 vs 監測 {decay.monitoredSize} 筆)——不代表 Setup 失效,但值得重新檢視,先別急著加碼
            </span>
          ) : (
            <span className="text-[0.76rem] text-text-secondary">
              正常(基準 {decay.baselineSize} 筆 vs 監測 {decay.monitoredSize} 筆,未觸發警報)
            </span>
          )}
        </div>
      )}

      {setup.registered && (
        <div className="mt-2.5 flex items-start gap-1.5 border-t border-border pt-2.5">
          <span className="pt-0.5 text-[0.72rem] font-semibold text-text-secondary">
            統計驗證
          </span>
          <HelpTooltip>
            PSR(機率式 Sharpe):這個 Setup 的 Sharpe 真的大於 0 的機率,只看它自己。DSR(去膨脹 Sharpe):把「你同時比較了幾個 Setup」這件事校正進去——比較的 Setup 越多,同一個 Sharpe 換算出的 DSR 會越低,因為挑最好的那個光靠運氣就會看起來不錯。符號排列檢定:把每筆交易的正負號隨機打散幾千次,算實際平均報酬贏過幾成的隨機結果(p 值越低越不像丟硬幣)。三個都需要帳戶總資金(換算報酬率)+ 至少 20 筆交易。**這裡沒有做 PBO/CSCV(過擬合機率的正式檢定)**,目前的 DSR 只是單一 Sharpe 的多重比較粗略校正,不是完整版本。
          </HelpTooltip>
          {!totalCapital ? (
            <span className="text-[0.76rem] text-text-tertiary">
              需要先在「設定 → 目標設定」填寫帳戶總資金。
            </span>
          ) : s.n < 20 ? (
            <span className="text-[0.76rem] text-text-tertiary">
              交易數不足 20 筆,樣本太少無法計算。
            </span>
          ) : !validation ? (
            <span className="text-[0.76rem] text-text-tertiary">目前無法計算。</span>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.76rem]">
              <span>
                <span className="text-text-secondary">PSR </span>
                <span className="num font-semibold">{fmt(validation.psr * 100, 0)}%</span>
              </span>
              <span>
                <span className="text-text-secondary">DSR </span>
                <span className="num font-semibold">
                  {validation.dsr === null ? "—" : `${fmt(validation.dsr * 100, 0)}%`}
                </span>
                {validation.dsr === null && (
                  <span className="text-text-tertiary">(只有這一個 Setup 符合門檻,還沒真正在做多重比較)</span>
                )}
              </span>
              <span>
                <span className="text-text-secondary">符號排列 p 值 </span>
                <span className="num font-semibold">{fmt(validation.mcptPValue, 3)}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SetupEditForm({
  setup,
  onDone,
}: {
  setup: SetupWithTrades;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(setup.name);
  const [entryLogic, setEntryLogic] = useState(setup.entryLogic ?? "");
  const [economicRationale, setEconomicRationale] = useState(setup.economicRationale ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input =
    "w-full rounded border border-border bg-canvas px-2.5 py-1.5 text-[0.85rem] text-text outline-none focus:border-accent";
  const label = "mb-1 block text-[0.76rem] font-semibold text-text-secondary";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/setups/${setup.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, entryLogic, economicRationale }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "儲存失敗");
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-2.5 rounded border border-accent bg-surface px-4 py-3.5">
      <div>
        <label className={label}>Setup 名稱</label>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className={label}>進場邏輯</label>
        <input className={input} value={entryLogic} onChange={(e) => setEntryLogic(e.target.value)} />
      </div>
      <div>
        <label className={label}>經濟機制(填了才算已登記進排行)</label>
        <input
          className={input}
          value={economicRationale}
          onChange={(e) => setEconomicRationale(e.target.value)}
        />
      </div>
      {error && <p className="text-[0.76rem] text-loss">{error}</p>}
      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-accent px-3 py-1.5 text-[0.8rem] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "儲存中…" : "儲存"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded border border-border px-3 py-1.5 text-[0.8rem] text-text-secondary hover:text-text"
        >
          取消
        </button>
      </div>
    </form>
  );
}
