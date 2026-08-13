// 紀律規則預設包(對應 prototype/index.html 的 rulePresets)。
// 使用者可以整包加入,再個別刪除/新增自訂規則——不是互斥的三選一畫面,
// 因為背後是一張可累加的 DisciplineRule 清單,不是「目前套用哪一包」的單一狀態。

export type DisciplinePresetKey = "ict" | "risk";

export const DISCIPLINE_PRESETS: Record<
  DisciplinePresetKey,
  { label: string; rules: string[] }
> = {
  ict: {
    label: "ICT 標準紀律包",
    rules: [
      "等待流動性掃蕩(Sweep)後才進場",
      "5M 結構轉換(MSS)確認後再進場",
      "進場前已標記止損位置",
    ],
  },
  risk: {
    label: "風險管理基礎包",
    rules: [
      "單筆風險不超過帳戶 2%",
      "虧損達當日上限即停手,不加碼攤平",
      "沒有在無計劃的情況下臨時開單",
    ],
  },
};
