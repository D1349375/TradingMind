"use client";

import { useEffect, useState } from "react";

// 只有兩種通知是「使用者在 app 裡就算得出來」的:交易待補充、當日虧損逼近
// 上限,存在側邊欄的圖示徽章上,開關存 localStorage 直接控制要不要顯示。
// 「每日記錄提醒」需要在使用者沒開 app 時也送得出通知(Web Push 或 Email),
// 目前沒有接這類服務,所以做成看得到、按不動的說明列,不假裝有這個功能。

const TOGGLES = [
  {
    key: "tm-notif-review",
    title: "新交易待補充提醒",
    desc: "交易記錄側邊欄顯示待補充筆數的徽章(超過 14 天前的交易不算)",
  },
  {
    key: "tm-notif-lossdanger",
    title: "當日虧損警告",
    desc: "今日虧損逼近每日上限(回撤緩衝剩不到 25%)時,Dashboard 側邊欄圖示會出現紅點",
  },
] as const;

export function NotificationSettings() {
  const [values, setValues] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const t of TOGGLES) next[t.key] = localStorage.getItem(t.key) !== "off";
    setValues(next);
  }, []);

  function toggle(key: string) {
    const next = !(values[key] ?? true);
    setValues((v) => ({ ...v, [key]: next }));
    localStorage.setItem(key, next ? "on" : "off");
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-border bg-surface px-5 py-5">
        {TOGGLES.map((t, i) => {
          const on = values[t.key] ?? true;
          return (
            <div
              key={t.key}
              className={`flex items-center justify-between gap-4 py-3 ${
                i < TOGGLES.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div>
                <div className="text-[0.9rem]">{t.title}</div>
                <div className="mt-0.5 text-[0.78rem] text-text-secondary">{t.desc}</div>
              </div>
              <button
                type="button"
                onClick={() => toggle(t.key)}
                aria-pressed={on}
                aria-label={`${on ? "關閉" : "開啟"}${t.title}`}
                className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
                  on ? "border-accent bg-accent" : "border-border bg-canvas"
                }`}
              >
                <span
                  className={`absolute top-[1px] h-[16px] w-[16px] rounded-full bg-white shadow transition-all ${
                    on ? "left-[17px]" : "left-[1px]"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded border border-dashed border-border bg-canvas px-4 py-4">
        <div className="mb-1 flex items-center justify-between gap-4">
          <div className="text-[0.9rem] text-text-secondary">每日記錄提醒</div>
          <span className="rounded-[3px] border border-border px-1.5 py-0.5 text-[9.5px] text-text-tertiary">
            尚未支援
          </span>
        </div>
        <p className="text-[0.78rem] leading-relaxed text-text-secondary">
          固定時間提醒盤後回顧,需要使用者沒開 app 時也能收到通知(Web Push 或
          Email),目前還沒有接這類服務。上面兩個通知因為是「打開 app 就算得出來」的
          即時狀態,不需要額外服務就能做;這個要等接了推播/寄信服務才會是真的開關,
          現在先誠實標成尚未支援,不做一個按了沒有作用的假開關。
        </p>
      </div>
    </div>
  );
}
