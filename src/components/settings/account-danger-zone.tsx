"use client";

import { useState } from "react";

export function AccountDangerZone({ email }: { email: string }) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = confirmEmail.trim().toLowerCase() === email.toLowerCase();

  async function handleDelete() {
    if (!matches) return;
    setBusy(true);
    setError(null);

    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmEmail }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "刪除失敗,請稍後再試");
      setBusy(false);
      return;
    }

    window.location.href = "/login";
  }

  return (
    <div className="rounded border border-loss bg-surface px-5 py-5">
      <div className="mb-1 text-[0.9rem] font-semibold text-loss">刪除帳號</div>
      <p className="mb-4 text-[0.82rem] leading-relaxed text-text-secondary">
        會立即刪除你的帳號與所有資料,包含交易紀錄、反思筆記與截圖、Setup、Playbook、
        紀律規則、Bybit 連線設定——
        <span className="font-semibold text-text">此動作無法復原。</span>
      </p>

      <label
        htmlFor="confirm-delete-email"
        className="mb-1.5 block text-[0.8rem] font-semibold text-text-secondary"
      >
        輸入你的 Email(<span className="font-mono">{email}</span>)以確認
      </label>
      <input
        id="confirm-delete-email"
        value={confirmEmail}
        onChange={(e) => setConfirmEmail(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className="mb-3 w-full rounded border border-border bg-canvas px-3 py-2 font-mono text-[0.85rem] text-text outline-none placeholder:text-text-tertiary focus:border-loss"
      />

      {error && (
        <div
          role="alert"
          className="mb-3 rounded border border-loss bg-loss-bg px-3 py-2 text-[0.82rem] leading-relaxed text-loss"
        >
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleDelete}
        disabled={!matches || busy}
        className="rounded bg-loss px-4 py-2 text-[0.85rem] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "刪除中…" : "永久刪除我的帳號"}
      </button>
    </div>
  );
}
