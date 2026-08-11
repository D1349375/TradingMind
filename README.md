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

## 目錄說明

- `prisma/schema.prisma` — 資料庫 schema,設計依據見檔案開頭註解
- `src/app` — Next.js App Router 頁面與 API Routes
