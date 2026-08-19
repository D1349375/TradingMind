"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SUBSCRIPTION_PLANS, compareTiers, type SubscriptionPlanTier } from "@/lib/subscription-plans";

type Status = {
  tier: "FREE" | SubscriptionPlanTier;
  active: boolean;
  currentPeriodEnd: string | null;
  pendingTier: "FREE" | SubscriptionPlanTier | null;
};

const TIER_LABEL: Record<string, string> = { FREE: "FREE", STANDARD: "STANDARD", ADVANCED: "ADVANCED" };

export function SubscriptionPlans() {
  const [status, setStatus] = useState<Status | null>(null);
  const [confirmTier, setConfirmTier] = useState<SubscriptionPlanTier | "cancel" | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    fetch("/api/billing/subscription")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ tier: "FREE", active: false, currentPeriodEnd: null, pendingTier: null }));
  }

  useEffect(refresh, []);

  function openConfirm(target: SubscriptionPlanTier | "cancel") {
    setAgreed(false);
    setError(null);
    setConfirmTier(target);
  }

  async function handleDowngradeOrCancel(targetTier: "FREE" | "STANDARD") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetTier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "處理失敗");
        return;
      }
      setConfirmTier(null);
      refresh();
    } catch {
      setError("網路錯誤,請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  if (status === null) {
    return (
      <div className="rounded border border-border bg-surface px-5 py-8 text-center text-[0.85rem] text-text-secondary">
        讀取訂閱狀態…
      </div>
    );
  }

  const isDowngradeOrCancelConfirm = confirmTier === "cancel";
  const targetPlan = !isDowngradeOrCancelConfirm && confirmTier ? SUBSCRIPTION_PLANS.find((p) => p.tier === confirmTier) : null;
  const isUpgrade = targetPlan ? compareTiers(targetPlan.tier, status.tier) > 0 : false;

  return (
    <div className="space-y-4">
      <div className="rounded border border-border bg-surface px-5 py-5">
        <div className="mb-1 text-[0.82rem] text-text-secondary">目前方案</div>
        <div className="text-[1.3rem] font-semibold">{TIER_LABEL[status.tier]}</div>
        {status.pendingTier !== null && status.currentPeriodEnd && (
          <p className="mt-2 rounded border border-warning bg-warning-bg px-3 py-2 text-[0.8rem] leading-relaxed text-warning">
            訂閱已排定於 {new Date(status.currentPeriodEnd).toLocaleDateString("zh-TW")} 到期後降為{" "}
            {TIER_LABEL[status.pendingTier]}。到期前你仍可使用目前方案的全部功能;到期後<strong>不會自動幫你重新訂閱</strong>,
            如果想繼續使用更高方案,需要屆時自己重新訂閱一次。
          </p>
        )}
        {status.active && status.currentPeriodEnd && status.pendingTier === null && (
          <p className="mt-1 text-[0.8rem] text-text-secondary">
            下次扣款日:{new Date(status.currentPeriodEnd).toLocaleDateString("zh-TW")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {SUBSCRIPTION_PLANS.map((plan) => {
          const isCurrent = status.tier === plan.tier && status.pendingTier === null;
          return (
            <div key={plan.tier} className="rounded border border-border bg-surface px-5 py-5">
              <div className="mb-1 text-[1rem] font-semibold">{plan.label}</div>
              <div className="num mb-1 text-[1.4rem] font-semibold">
                NT${plan.priceTwd} <span className="text-[0.8rem] font-normal text-text-secondary">/月</span>
              </div>
              <div className="mb-4 text-[0.8rem] text-text-secondary">每月贈送 {plan.monthlyCredits} Credits(用不完歸零)</div>
              <button
                type="button"
                disabled={isCurrent}
                onClick={() => openConfirm(plan.tier)}
                className="w-full rounded bg-accent px-3 py-2 text-[0.85rem] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {isCurrent ? "目前方案" : compareTiers(plan.tier, status.tier) > 0 ? "升級" : "切換"}
              </button>
            </div>
          );
        })}
      </div>

      {status.active && status.pendingTier === null && (
        <button
          type="button"
          onClick={() => openConfirm("cancel")}
          className="text-[0.8rem] text-text-secondary underline hover:text-loss"
        >
          {status.tier === "ADVANCED" ? "降級或取消訂閱" : "取消訂閱"}
        </button>
      )}

      {confirmTier !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[440px] rounded border border-border bg-surface p-5">
            {isDowngradeOrCancelConfirm ? (
              <>
                <h3 className="mb-2 text-[1.02rem] font-semibold text-text">取消或降級訂閱</h3>
                <p className="mb-3 text-[0.85rem] leading-relaxed text-text-secondary">
                  這會立即停止後續扣款,但<strong>當期已付費用不予退還</strong>,你仍可使用目前方案的功能直到{" "}
                  {status.currentPeriodEnd ? new Date(status.currentPeriodEnd).toLocaleDateString("zh-TW") : "本期"}
                  到期。到期後<strong>不會自動幫你訂閱較低方案</strong>,需要自己重新訂閱。
                </p>
                <div className="mb-4 flex flex-col gap-2">
                  {status.tier === "ADVANCED" && (
                    <button
                      type="button"
                      onClick={() => handleDowngradeOrCancel("STANDARD")}
                      disabled={busy}
                      className="rounded border border-border bg-canvas px-3.5 py-2 text-[0.85rem] hover:border-accent disabled:opacity-50"
                    >
                      降級為 STANDARD(到期後生效)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDowngradeOrCancel("FREE")}
                    disabled={busy}
                    className="rounded border border-border bg-canvas px-3.5 py-2 text-[0.85rem] text-loss hover:border-loss disabled:opacity-50"
                  >
                    {busy ? "處理中…" : "完全取消訂閱(到期後變回 FREE)"}
                  </button>
                </div>
                {error && (
                  <div role="alert" className="mb-3 rounded border border-loss bg-loss-bg px-3 py-2 text-[0.8rem] text-loss">
                    {error}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmTier(null)}
                  className="w-full rounded border border-border bg-canvas px-3.5 py-1.5 text-[0.82rem] text-text-secondary hover:border-accent hover:text-accent"
                >
                  先不變更
                </button>
              </>
            ) : (
              targetPlan && (
                <>
                  <h3 className="mb-2 text-[1.02rem] font-semibold text-text">
                    {isUpgrade ? "升級為" : "切換為"} {targetPlan.label}
                  </h3>
                  <p className="mb-3 text-[0.85rem] leading-relaxed text-text-secondary">
                    每月 NT${targetPlan.priceTwd},透過綠界信用卡定期定額扣款,<strong>自動續訂直到你取消為止</strong>。
                    {isUpgrade
                      ? "升級立即生效,現有方案當期已付費用不予折抵。"
                      : "確認後會立即以新方案金額重新授權一次。"}
                  </p>
                  <label className="mb-4 flex items-start gap-2 text-[0.8rem] text-text-secondary">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      我已閱讀並同意
                      <Link href="/terms" target="_blank" className="text-accent underline">
                        服務條款
                      </Link>
                      (含第5節付費方案與退款政策)與
                      <Link href="/privacy" target="_blank" className="text-accent underline">
                        隱私權政策
                      </Link>
                      ,了解此為每月自動續扣的訂閱方案。
                    </span>
                  </label>
                  {error && (
                    <div role="alert" className="mb-3 rounded border border-loss bg-loss-bg px-3 py-2 text-[0.8rem] text-loss">
                      {error}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmTier(null)}
                      className="flex-1 rounded border border-border bg-canvas px-3.5 py-2 text-[0.85rem] text-text-secondary hover:border-accent hover:text-accent"
                    >
                      取消
                    </button>
                    <a
                      href={agreed ? `/api/billing/subscribe?tier=${targetPlan.tier}` : undefined}
                      aria-disabled={!agreed}
                      className={`flex-1 rounded px-3.5 py-2 text-center text-[0.85rem] font-semibold text-white transition-opacity ${
                        agreed ? "bg-accent hover:opacity-90" : "cursor-not-allowed bg-accent/40"
                      }`}
                      onClick={(e) => {
                        if (!agreed) e.preventDefault();
                      }}
                    >
                      前往付款
                    </a>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
