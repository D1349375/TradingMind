// R 值(風報比)計算。標準定義(Van Tharp):實際損益 ÷ 初始風險,
// 只需要進場價、止損價、實際出場價——不需要目標價(目標價是選填的
// 「計畫 R:R」對照用,見 TradeMind_產品規劃書.md 4.2.1 節)。
//
// 止損價設在錯誤那一側(多單止損高於進場價、空單止損低於進場價)時
// 代表資料本身有誤,回傳 null 而不是硬算出一個負的風險量級冒充結果。
export function calcRMultiple(
  direction: "LONG" | "SHORT",
  entryPrice: number,
  exitPrice: number | null,
  stopLossPrice: number | null,
): number | null {
  if (exitPrice === null || stopLossPrice === null) return null;

  const risk =
    direction === "LONG" ? entryPrice - stopLossPrice : stopLossPrice - entryPrice;
  if (risk <= 0) return null;

  const reward = direction === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return reward / risk;
}
