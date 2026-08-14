// PSR/DSR/MCPT——移植自 skills/quant skill 的驗證方法論(dsr.py/mcpt_plot.py
// 的精神,不是逐行翻譯,因為原始 script 是給系統化回測用 numpy/scipy,這裡
// 全部改成沒有依賴的純 TS)。對應 TradeMind_裁量交易版統計驗證流程規劃.md
// 情況A(單一Setup驗證,PSR)與情況B(Playbook多Setup排行,DSR)。
//
// **PBO/CSCV(組合對稱交叉驗證)刻意沒有實作**——需要先做「時間軸對齊聚合」
// (不同 Setup 觸發頻率不同,要決定怎麼切成可比較的時間區塊)加上組合式
// 訓練/測試切分,是這幾項裡工程量最大、最容易做錯的一塊,獨立排期比較
// 誠實,不要為了湊齊四項而做一個馬虎的版本。

// ---- 常態分布相關的數學工具(erf 近似 + Acklam 反函數近似) ----

// Abramowitz & Stegun 7.1.26,最大誤差 1.5e-7,對這裡的用途綽綽有餘。
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y =
    1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// Peter Acklam 的反常態分布近似算法,業界常用的標準近似。
export function normalInvCdf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;

  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= phigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

function mean(x: number[]): number {
  return x.reduce((s, v) => s + v, 0) / x.length;
}

function sampleStd(x: number[], m: number): number {
  const variance = x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1);
  return Math.sqrt(variance);
}

function skewness(x: number[], m: number, std: number): number {
  const n = x.length;
  const m3 = x.reduce((s, v) => s + (v - m) ** 3, 0) / n;
  return std > 0 ? m3 / std ** 3 : 0;
}

// 這裡用「原始峰度」(常態分布=3),不是超額峰度,對應 PSR 公式的慣例。
function kurtosis(x: number[], m: number, std: number): number {
  const n = x.length;
  const m4 = x.reduce((s, v) => s + (v - m) ** 4, 0) / n;
  return std > 0 ? m4 / std ** 4 : 3;
}

// ---- PSR:單一 Setup 的機率式 Sharpe(情況A) ----
// 「觀測到的 Sharpe,有多少機率其真實值大於 benchmarkSR」。
// benchmarkSR=0 時就是「這個 Setup 有沒有真實優勢(而非純運氣)」。
export type PsrResult = { psr: number; sharpe: number; n: number };

export function probabilisticSharpeRatio(
  returns: number[],
  benchmarkSR = 0,
): PsrResult | null {
  const n = returns.length;
  if (n < 20) return null; // 呼叫端也會用 sampleTier 分級,這裡是防呆
  const m = mean(returns);
  const std = sampleStd(returns, m);
  if (std <= 0) return null;
  const sharpe = m / std; // 逐筆 Sharpe,不年化——PSR 公式本身是逐期定義的
  const skew = skewness(returns, m, std);
  const kurt = kurtosis(returns, m, std);
  const denom = Math.sqrt(1 - skew * sharpe + ((kurt - 1) / 4) * sharpe ** 2);
  if (!Number.isFinite(denom) || denom <= 0) return null;
  const z = ((sharpe - benchmarkSR) * Math.sqrt(n - 1)) / denom;
  return { psr: normalCdf(z), sharpe, n };
}

// ---- DSR:多 Setup 排行的去膨脹 Sharpe(情況B) ----
// 把 PSR 的 benchmark 從 0 換成「N 個 Setup 都是純雜訊時,期望的最大 Sharpe」——
// 校正「測越多個、挑最好的那個看起來越強」這個多重比較偏誤。
const EULER_MASCHERONI = 0.5772156649015329;

export function expectedMaxSharpeUnderNoise(
  nTrials: number,
  sharpeStdAcrossTrials: number,
): number {
  if (nTrials <= 1 || sharpeStdAcrossTrials <= 0) return 0;
  return (
    sharpeStdAcrossTrials *
    ((1 - EULER_MASCHERONI) * normalInvCdf(1 - 1 / nTrials) +
      EULER_MASCHERONI * normalInvCdf(1 - 1 / (nTrials * Math.E)))
  );
}

export type DsrResult = { dsr: number; sharpe: number; sr0: number; n: number };

export function deflatedSharpeRatio(
  returns: number[],
  nTrials: number,
  sharpeStdAcrossTrials: number,
): DsrResult | null {
  const sr0 = expectedMaxSharpeUnderNoise(nTrials, sharpeStdAcrossTrials);
  const r = probabilisticSharpeRatio(returns, sr0);
  if (!r) return null;
  return { dsr: r.psr, sharpe: r.sharpe, sr0, n: r.n };
}

// ---- MCPT:符號排列檢定 ----
// 把每筆交易的損益「正負號」隨機打散(大小保留,只重新洗牌方向),模擬
//「如果這個 Setup 其實沒有方向性優勢、每筆賺賠各半是丟硬幣決定的」情境下,
// 平均報酬會長什麼分布。p 值 = 隨機排列版本的平均報酬「大於等於」實際觀測值
// 的比例——p 值越低,代表實際表現越不像是丟硬幣就能碰到的結果。
// 這是符號排列檢定,不是把交易時間順序打亂(時間順序打亂不影響總和/均值,
// 測不出「均值是否顯著」這件事,只能測路徑相關的統計量如最大回撤)。
export type McptResult = { pValue: number; observedMean: number; simulations: number };

export function signPermutationTest(
  returns: number[],
  simulations = 2000,
): McptResult | null {
  const n = returns.length;
  if (n < 20) return null;
  const magnitudes = returns.map((r) => Math.abs(r));
  const observedMean = mean(returns);

  let countGte = 0;
  for (let s = 0; s < simulations; s++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const sign = Math.random() < 0.5 ? 1 : -1;
      sum += sign * magnitudes[i];
    }
    if (sum / n >= observedMean) countGte++;
  }
  return { pValue: countGte / simulations, observedMean, simulations };
}
