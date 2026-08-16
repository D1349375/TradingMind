// 獨立成小檔案(不依賴 next/headers/Prisma)——account-filter.ts 是伺服器端
// 專用(用到 next/headers 的 cookies()),但 client component
// (account-filter-switcher.tsx)也需要知道同一個 cookie 名稱來寫入,
// 不能直接 import 伺服器端那個檔案(會把 next/headers/Prisma 一起打包進瀏覽器)。
export const ACCOUNT_FILTER_COOKIE = "tm_account_filter";
