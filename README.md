# TradeMind

交易日誌平台。加密貨幣合約交易者的智慧記錄與分析工具。

- 產品規劃:[`../TradeMind_產品規劃書.md`](../TradeMind_產品規劃書.md)
- UI 設計系統(顏色/字級/元件規則,**開發新介面前必讀**):[`../design.md`](../design.md)
- 裁量交易統計驗證方法論:[`../TradeMind_裁量交易版統計驗證流程規劃.md`](../TradeMind_裁量交易版統計驗證流程規劃.md)
- 靜態設計原型(參考版面,非本專案程式碼):[`../prototype/index.html`](../prototype/index.html)

## 技術棧

Next.js 14(App Router)+ TypeScript + Tailwind + shadcn/ui + Prisma + Supabase(Postgres + Auth)。理由見規劃書第六節。

## 開發環境設置

1. `npm install`
2. 複製 `.env.example` 成 `.env.local`,填入 Supabase 專案的連線資訊(見 `.env.example` 內註解)
3. `npx prisma migrate dev` 建立資料表
4. `npm run dev`

## 開發注意事項

**不要在 `npm run dev` 還跑著的時候執行 `npm run build`。** 兩者共用同一個 `.next` 目錄,production build 會覆蓋掉 dev server 正在使用的 chunk,導致頁面變成完全沒有樣式的裸 HTML(CSS 與 JS 都 404,終端機出現 `Cannot find module './948.js'`)。

真的發生時的修復方式:

```bash
# 停掉 dev server,然後
rm -rf .next && npm run dev
```

要驗證 production build 前,先停掉 dev server。

**改完 schema 跑 `prisma migrate` / `prisma generate` 之後,要重啟 dev server。** 執行中的 dev server 會把舊版 Prisma Client 留在記憶體裡,新欄位/新的 nullable 設定不會生效,而且錯誤訊息會非常誤導(例如欄位可為 null 的改動沒生效時,會報成 ``Argument `user` is missing``,跟真正的原因無關)。

**`prisma migrate dev` 用本機 `.env.local` 的連線池網址會整個掛住不回應**(2026-08-15 踩過)。本機開發用的是 Supabase transaction-mode pooler(port 6543,`DATABASE_URL`),這個模式跟 Prisma migration engine 的 advisory lock 機制不相容,`migrate` 指令會卡住沒有任何輸出、也不會報錯。`prisma.config.ts` 已經改成 CLI 操作(migrate/generate)優先讀 `DIRECT_URL`(session-mode pooler,port 5432),平常 `npx prisma migrate dev` 直接跑就會自動用對的網址,不用手動處理——但如果 `.env.local` 沒有設 `DIRECT_URL`,還是會退回 `DATABASE_URL` 卡住,遇到「migrate 指令沒有任何輸出、一直不結束」時先檢查這個。

## 目錄說明

- `prisma/schema.prisma` — 資料庫 schema,設計依據見檔案開頭註解
- `src/app` — Next.js App Router 頁面與 API Routes
