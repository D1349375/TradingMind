import type { Metadata } from "next";
import { JournalView } from "@/components/journal/journal-view";

export const metadata: Metadata = {
  title: "每日日記 · TradeMind",
};

export default function JournalPage() {
  return (
    <div className="px-9 py-8">
      <div className="mx-auto max-w-[840px]">
        <div className="mb-5">
          <h1 className="text-[1.4rem] font-semibold">每日日記</h1>
          <p className="mt-0.5 text-[0.84rem] text-text-secondary">
            盤前計劃與盤後反思
          </p>
        </div>
        <JournalView />
      </div>
    </div>
  );
}
