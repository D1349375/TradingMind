"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

// 把 Supabase 的英文錯誤訊息轉成使用者看得懂的繁中。
// 沒對應到的一律回傳原文,不要吞掉——寧可顯示英文,也不要讓使用者卡在無意義的通用訊息。
function translateError(message: string): string {
  const map: Record<string, string> = {
    "Invalid login credentials": "帳號或密碼錯誤",
    "Email not confirmed": "信箱尚未驗證,請先到信箱點擊驗證連結",
    "User already registered": "這個信箱已經註冊過了",
    "Password should be at least 6 characters":
      "密碼至少需要 6 個字元",
    "Unable to validate email address: invalid format": "信箱格式不正確",
  };
  return map[message] ?? message;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignup = mode === "signup";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setError(translateError(error.message));
        setLoading(false);
        return;
      }
      // Supabase 專案若開啟信箱驗證,此時還沒有 session
      if (data.session) {
        router.push(redirectTo);
        router.refresh();
      } else {
        setNotice("註冊成功。我們寄了一封驗證信到你的信箱,點擊信中連結後即可登入。");
        setLoading(false);
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(translateError(error.message));
      setLoading(false);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  async function handleGoogle() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
      },
    });
    if (error) setError(translateError(error.message));
  }

  const inputClass =
    "w-full rounded border border-border bg-canvas px-3 py-2 text-[0.95rem] text-text outline-none placeholder:text-text-tertiary focus:border-accent";

  return (
    <div className="w-full max-w-[380px]">
      <div className="mb-7 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-accent text-xs font-bold text-white">
          T
        </span>
        <span className="text-[0.95rem] font-semibold">TradeMind</span>
      </div>

      <h1 className="mb-1 text-[1.4rem] font-semibold">
        {isSignup ? "建立帳號" : "登入"}
      </h1>
      <p className="mb-6 text-[0.85rem] text-text-secondary">
        {isSignup
          ? "開始記錄你的每一筆交易。"
          : "歡迎回來,繼續你的交易紀錄。"}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-[0.8rem] font-semibold text-text-secondary"
          >
            電子信箱
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-[0.8rem] font-semibold text-text-secondary"
          >
            密碼
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder={isSignup ? "至少 6 個字元" : ""}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded border border-loss bg-loss-bg px-3 py-2 text-[0.82rem] text-loss"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="rounded border border-profit bg-profit-bg px-3 py-2 text-[0.82rem] text-profit"
          >
            {notice}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-accent px-4 py-2.5 text-[0.9rem] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "處理中…" : isSignup ? "建立帳號" : "登入"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[0.75rem] text-text-secondary">或</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        className="flex w-full items-center justify-center gap-2 rounded border border-border bg-surface px-4 py-2.5 text-[0.9rem] text-text transition-colors hover:border-accent hover:text-accent"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M10 8.2v3.7h5.2a4.5 4.5 0 0 1-1.9 2.9v2.4h3.1c1.8-1.7 2.9-4.2 2.9-7.1 0-.7-.1-1.3-.2-1.9H10z"
          />
          <path
            fill="currentColor"
            opacity="0.7"
            d="M10 20c2.6 0 4.8-.9 6.4-2.3l-3.1-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.7-1.7-5.4-4H1.4v2.5A9.7 9.7 0 0 0 10 20z"
          />
          <path
            fill="currentColor"
            opacity="0.5"
            d="M4.6 12.2a5.8 5.8 0 0 1 0-3.7V6H1.4a9.7 9.7 0 0 0 0 8.7l3.2-2.5z"
          />
          <path
            fill="currentColor"
            opacity="0.85"
            d="M10 4c1.4 0 2.7.5 3.7 1.4l2.8-2.8A9.7 9.7 0 0 0 1.4 6l3.2 2.5C5.3 5.7 7.5 4 10 4z"
          />
        </svg>
        使用 Google 帳號{isSignup ? "註冊" : "登入"}
      </button>

      <p className="mt-6 text-center text-[0.83rem] text-text-secondary">
        {isSignup ? "已經有帳號了?" : "還沒有帳號?"}{" "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="font-semibold text-accent hover:underline"
        >
          {isSignup ? "登入" : "建立帳號"}
        </Link>
      </p>
    </div>
  );
}
