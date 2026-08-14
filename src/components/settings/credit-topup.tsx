"use client";

import { useEffect, useState } from "react";
import { CREDIT_PACKS } from "@/lib/credit-packs";

type Order = {
  merchantTradeNo: string;
  creditAmount: number;
  priceTwd: number;
  status: "PENDING" | "PAID" | "FAILED";
  paymentType: string | null;
  createdAt: string;
  paidAt: string | null;
};

const STATUS_LABEL: Record<Order["status"], string> = {
  PENDING: "處理中",
  PAID: "已完成",
  FAILED: "失敗",
};

const STATUS_TONE: Record<Order["status"], string> = {
  PENDING: "text-text-secondary",
  PAID: "text-profit",
  FAILED: "text-loss",
};

export function CreditTopup() {
  const [balance, setBalance] = useState<number | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    fetch("/api/billing/history")
      .then((r) => r.json())
      .then((data) => {
        setBalance(data.balance);
        setOrders(data.orders);
      })
      .catch(() => {
        setBalance(0);
        setOrders([]);
      });
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded border border-border bg-surface px-5 py-5">
        <div className="mb-1 text-[0.82rem] text-text-secondary">目前餘額</div>
        <div className="num text-[1.6rem] font-semibold">
          {balance === null ? "…" : balance} <span className="text-[0.9rem] text-text-secondary">Credits</span>
        </div>
      </div>

      <div className="rounded border border-border bg-surface px-5 py-5">
        <div className="mb-1 text-[0.9rem] font-semibold">儲值方案</div>
        <p className="mb-4 text-[0.8rem] leading-relaxed text-text-secondary">
          透過綠界結帳,支援信用卡/ATM/超商代碼等付款方式。付款完成後 Credit 會自動加值,
          非即時到帳的付款方式(ATM/超商)要等實際繳費後才會入帳。
        </p>
        <div className="grid grid-cols-3 gap-3">
          {CREDIT_PACKS.map((pack) => (
            <a
              key={pack.id}
              href={`/api/billing/checkout?pack=${pack.id}`}
              className="block rounded border border-border bg-canvas px-4 py-4 text-center transition-colors hover:border-accent"
            >
              <div className="num text-[1.2rem] font-semibold">{pack.credits}</div>
              <div className="mb-2 text-[0.75rem] text-text-secondary">Credits</div>
              <div className="num text-[0.9rem] font-semibold text-accent">
                NT$ {pack.priceTwd}
              </div>
            </a>
          ))}
        </div>
      </div>

      <div className="rounded border border-border bg-surface px-5 py-5">
        <div className="mb-3 text-[0.9rem] font-semibold">儲值紀錄</div>
        {orders === null ? (
          <p className="text-[0.82rem] text-text-secondary">讀取中…</p>
        ) : orders.length === 0 ? (
          <p className="text-[0.82rem] text-text-secondary">還沒有儲值紀錄。</p>
        ) : (
          <table className="w-full border-collapse text-[0.85rem]">
            <thead>
              <tr>
                {["時間", "Credit", "金額", "狀態"].map((h, i) => (
                  <th
                    key={h}
                    className={`border-b border-border px-2 py-1.5 text-[0.75rem] font-semibold text-text-secondary ${
                      i === 0 ? "text-left" : "text-right"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.merchantTradeNo}>
                  <td className="border-b border-border px-2 py-1.5 text-text-secondary">
                    {new Date(o.createdAt).toLocaleString("zh-TW")}
                  </td>
                  <td className="num border-b border-border px-2 py-1.5 text-right">
                    {o.creditAmount}
                  </td>
                  <td className="num border-b border-border px-2 py-1.5 text-right">
                    NT$ {o.priceTwd}
                  </td>
                  <td
                    className={`border-b border-border px-2 py-1.5 text-right font-semibold ${STATUS_TONE[o.status]}`}
                  >
                    {STATUS_LABEL[o.status]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
