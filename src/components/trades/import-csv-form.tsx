"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Result = { imported: number; skippedDuplicates: number; errors: { line: number; message: string }[] };
type AccountOption = { id: string; label: string };

// Bybit「已實現盈虧」CSV 匯出檔匯入。格式解析見 lib/bybit-csv.ts 開頭註解——
// 這份 CSV 沒有方向欄位也沒有時區資訊,方向靠公式反推、時區要使用者自己
// 對照 Bybit 帳號設定填,不能瞎猜。
export function ImportCsvForm() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-[0.84rem] text-text-secondary hover:border-accent hover:text-accent"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-3.5 w-3.5">
          <path d="M4 13v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2M10 3v10M6 9l4 4 4-4" />
        </svg>
        匯入 CSV
      </button>
      {open && <Modal onClose={() => setOpen(false)} />}
    </>
  );
}

function Modal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountOption[] | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [offsetHours, setOffsetHours] = useState(() => -(new Date().getTimezoneOffset() / 60));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        const list: AccountOption[] = d.accounts ?? [];
        setAccounts(list);
        if (list.length > 0) setAccountId(list[0].id);
      })
      .catch(() => setAccounts([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const csvText = await file.text();
      const res = await fetch("/api/trades/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText,
          utcOffsetMinutes: offsetHours * 60,
          accountId: accountId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "匯入失敗");
        return;
      }
      setResult(data);
      if (data.imported > 0) router.refresh();
    } catch {
      setError("讀取檔案失敗");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded border border-border bg-canvas px-2.5 py-1.5 text-[0.87rem] text-text outline-none focus:border-accent";

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded border border-border bg-surface p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[1.1rem] font-semibold">匯入 Bybit CSV</h2>
          <button type="button" onClick={onClose} aria-label="關閉" className="text-text-secondary hover:text-text">
            ×
          </button>
        </div>

        <p className="mb-4 text-[0.8rem] leading-relaxed text-text-secondary">
          支援 Bybit「已實現盈虧」匯出的 CSV(欄位含 Market/Entry Price/Exit
          Price/Realized P&L 等)。已經匯入過或跟現有交易重複的行會自動跳過,
          可以放心重複匯入同一份檔案。
        </p>

        <form onSubmit={submit} className="space-y-3">
          {accounts && accounts.length > 1 && (
            <div>
              <label className="mb-1 block text-[0.8rem] font-semibold text-text-secondary">帳戶模板</label>
              <select
                className={input}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-[0.8rem] font-semibold text-text-secondary">CSV 檔案</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-[0.85rem]"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[0.8rem] font-semibold text-text-secondary">
              時區(UTC 偏移小時數)
            </label>
            <input
              type="number"
              step="0.5"
              value={offsetHours}
              onChange={(e) => setOffsetHours(Number(e.target.value))}
              className={input}
            />
            <p className="mt-1 text-[0.72rem] text-text-tertiary">
              CSV 的「Trade time」欄位是你 Bybit 帳號設定的顯示時區,不是 UTC——
              預設帶入瀏覽器目前的時區,不確定的話去 Bybit 帳號設定核對後再調整。
            </p>
          </div>

          {error && (
            <div role="alert" className="rounded border border-loss bg-loss-bg px-3 py-2 text-[0.82rem] text-loss">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded border border-border bg-canvas px-3.5 py-3 text-[0.82rem]">
              <p>
                匯入 <b className="num text-profit">{result.imported}</b> 筆,
                跳過重複 <b className="num">{result.skippedDuplicates}</b> 筆
                {result.errors.length > 0 && (
                  <>
                    ,失敗 <b className="num text-loss">{result.errors.length}</b> 筆
                  </>
                )}
                。
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-[0.75rem] text-text-secondary">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      第 {e.line} 行:{e.message}
                    </li>
                  ))}
                  {result.errors.length > 20 && <li>…還有 {result.errors.length - 20} 筆</li>}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={busy || !file}
              className="rounded bg-accent px-4 py-1.5 text-[0.85rem] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "匯入中…" : "開始匯入"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border px-4 py-1.5 text-[0.85rem] text-text-secondary hover:text-text"
            >
              {result ? "關閉" : "取消"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
