"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { ResizableImage } from "@/components/trades/rich-editor/resizable-image";

// Notion/Word 風格的簡易記錄編輯器:文字格式(粗體/斜體/標題/清單)+
// 可插入、可調整大小的圖片,取代原本分開的「反思筆記」純文字框跟
// 「截圖」固定兩格版位。內容存 HTML 字串在 Trade.reflectionNote。
export function RichNoteEditor({
  tradeId,
  initialContent,
  onSave,
}: {
  tradeId: string;
  initialContent: string;
  onSave: (html: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Tiptap 在 SSR 階段產生的 HTML 容易跟 client hydration 對不上,
  // 乾脆整個編輯器延後到掛載後才渲染,跟這個專案處理時區/本地狀態
  // hydration 問題一貫的做法一樣。
  if (!mounted) {
    return (
      <div className="min-h-[55vh] rounded border border-border bg-canvas px-3.5 py-3 text-[0.85rem] text-text-tertiary">
        讀取中…
      </div>
    );
  }

  return <Editor tradeId={tradeId} initialContent={initialContent} onSave={onSave} />;
}

function Editor({
  tradeId,
  initialContent,
  onSave,
}: {
  tradeId: string;
  initialContent: string;
  onSave: (html: string) => void;
}) {
  const savedRef = useRef(initialContent);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      ResizableImage,
    ],
    content: initialContent || "",
    editorProps: {
      attributes: {
        class:
          "prose-note min-h-[55vh] rounded-b border border-t-0 border-border bg-canvas px-3.5 py-3 text-[0.9rem] leading-[1.7] text-text outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (html === savedRef.current) return;
        savedRef.current = html;
        onSave(html);
      }, 800);
    },
  });

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function handleFile(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/trades/${tradeId}/images`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? "上傳失敗");
        return;
      }
      editor?.chain().focus().setImage({ src: data.url }).run();
    } catch {
      setUploadError("網路錯誤,上傳失敗");
    } finally {
      setUploading(false);
    }
  }

  if (!editor) return null;

  const btn = (active: boolean) =>
    `flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-[0.8rem] font-semibold ${
      active ? "bg-accent-soft text-accent" : "text-text-secondary hover:bg-surface hover:text-text"
    }`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 rounded-t border border-border bg-surface px-2 py-1.5">
        <button type="button" className={btn(editor.isActive("bold"))} title="粗體" onClick={() => editor.chain().focus().toggleBold().run()}>
          B
        </button>
        <button type="button" className={`${btn(editor.isActive("italic"))} italic`} title="斜體" onClick={() => editor.chain().focus().toggleItalic().run()}>
          I
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button type="button" className={btn(editor.isActive("heading", { level: 2 }))} title="大標題" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </button>
        <button type="button" className={btn(editor.isActive("heading", { level: 3 }))} title="小標題" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button type="button" className={btn(editor.isActive("bulletList"))} title="項目符號清單" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-3.5 w-3.5">
            <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
            <circle cx="4" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="4" cy="14" r="1" fill="currentColor" stroke="none" />
            <line x1="8" y1="6" x2="16" y2="6" />
            <line x1="8" y1="10" x2="16" y2="10" />
            <line x1="8" y1="14" x2="16" y2="14" />
          </svg>
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          className={btn(false)}
          title="插入圖片"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            "…"
          ) : (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <rect x="3" y="4" width="14" height="12" rx="1.5" />
              <circle cx="7" cy="8" r="1.2" fill="currentColor" stroke="none" />
              <path d="M4 14l4.5-4.5L11 12l2-2 3 3" />
            </svg>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
      <EditorContent editor={editor} />
      {uploadError && (
        <p className="mt-1.5 text-[0.75rem] text-loss">{uploadError}</p>
      )}
      <p className="mt-1.5 text-[0.7rem] text-text-tertiary">
        圖片插入後點一下選取,拖右下角圓點可以調整大小。
      </p>
    </div>
  );
}
