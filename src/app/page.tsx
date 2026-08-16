import { redirect } from "next/navigation";

// 首頁目前不做行銷落地頁,依登入狀態分流的邏輯已經在 middleware 做完
// (matcher 涵蓋 "/",那邊已經有 getUser() 結果可以直接用)。這裡不再重打
// 一次 Supabase——正常情況下這個 component 不會真的被渲染到,只是給
// middleware 邏輯萬一失效時的靜態備援,固定導去 /login 不需要額外查詢。
// 之後要做對外的產品介紹頁時,再把這裡換成實際內容。
export default function Home() {
  redirect("/login");
}
