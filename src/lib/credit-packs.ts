// 純資料,client/server 都能安全 import——跟會拉進 Node-only ECPay SDK 的
// lib/ecpay.ts 分開,避免瀏覽器端 bundle 到 SDK 用到的 fs/crypto 等模組。

// Credit 儲值包正式定價(2026-08-19 定案,見
// `TradeMind_Credit定價與營收策略.md` 第六節)。用規劃書 11.2 節的
// $0.0385/credit 公式價換算美金,大包量大漸折(8%/15%),抓當時匯率
// 32(實測 31.9,誤差可忽略)換算成台幣。
export const CREDIT_PACKS = [
  { id: "pack_100", credits: 100, priceTwd: 125 },
  { id: "pack_300", credits: 300, priceTwd: 340 },
  { id: "pack_1000", credits: 1000, priceTwd: 1050 },
] as const;

export type CreditPackId = (typeof CREDIT_PACKS)[number]["id"];

export function findCreditPack(id: string) {
  return CREDIT_PACKS.find((p) => p.id === id) ?? null;
}
