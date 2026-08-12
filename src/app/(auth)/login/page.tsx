import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "登入 · TradeMind",
};

export default function LoginPage() {
  // AuthForm 用了 useSearchParams,必須包在 Suspense 裡才能靜態預先渲染
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
