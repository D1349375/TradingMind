import fs from "node:fs";
import path from "node:path";

// 人格檔案登記表。內容是從 DebateSystem 手動複製過來的,見各檔案開頭的
// source_repo/sync_note——不要在這裡改人格內容,要改回頭去改 DebateSystem。
export const PERSONAS = {
  ict: { name: "ICT", file: "ict.md" },
  tjr: { name: "TJR", file: "tjr.md" },
  emperorbtc: { name: "EmperorBTC", file: "emperorbtc.md" },
} as const;

export type PersonaKey = keyof typeof PERSONAS;

export function isPersonaKey(v: string): v is PersonaKey {
  return v in PERSONAS;
}

// 讀取人格 SKILL.md 全文,拿掉 frontmatter 只留下真正的角色設定內容——
// source_repo/synced_at 這些是給人看的複本追蹤資訊,不該送進 system prompt
// 讓模型看到不相干的 metadata。
export function loadPersonaContent(key: PersonaKey): string {
  const filePath = path.join(process.cwd(), "src/lib/personas", PERSONAS[key].file);
  const raw = fs.readFileSync(filePath, "utf-8");
  return raw.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}
