// 純資料,client/server 都能安全 import——跟會拉進 Node-only ECPay SDK 的
// lib/ecpay.ts 分開,避免瀏覽器端 bundle 到 SDK 用到的 fs/crypto 等模組。

// Credit 儲值包。價格是先立的佔位值,正式上線前使用者要確認真實定價
// 再改這裡——不要當成已經定案的售價使用。
export const CREDIT_PACKS = [
  { id: "pack_100", credits: 100, priceTwd: 99 },
  { id: "pack_300", credits: 300, priceTwd: 269 },
  { id: "pack_1000", credits: 1000, priceTwd: 799 },
] as const;

export type CreditPackId = (typeof CREDIT_PACKS)[number]["id"];

export function findCreditPack(id: string) {
  return CREDIT_PACKS.find((p) => p.id === id) ?? null;
}
