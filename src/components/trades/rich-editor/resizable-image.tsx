"use client";

import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { useRef, useState } from "react";

// Tiptap 核心的 Image extension 沒有內建可調整大小,官方也沒有一致維護的
// resize 套件——與其裝一個來源不明的第三方套件,直接繼承官方 Image 加一個
// width attribute + 自訂 NodeView 拖拉把手,自己刻的邏輯很簡單也比較可控。
export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute("width"),
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [dragging, setDragging] = useState(false);

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const img = imgRef.current;
    if (!img) return;
    const startX = e.clientX;
    const startWidth = img.getBoundingClientRect().width;
    setDragging(true);

    function onMove(ev: PointerEvent) {
      const next = Math.max(80, Math.round(startWidth + (ev.clientX - startX)));
      updateAttributes({ width: `${next}px` });
    }
    function onUp() {
      setDragging(false);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return (
    <NodeViewWrapper className="relative inline-block max-w-full" data-drag-handle>
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt ?? ""}
        width={node.attrs.width ?? undefined}
        className={`max-w-full rounded border ${selected ? "border-accent" : "border-border"}`}
        style={{ width: node.attrs.width ?? undefined }}
      />
      {selected && (
        <span
          onPointerDown={startResize}
          role="presentation"
          className={`absolute bottom-0 right-0 h-3.5 w-3.5 translate-x-1/2 translate-y-1/2 cursor-se-resize rounded-full border-2 border-white bg-accent ${
            dragging ? "opacity-100" : "opacity-90"
          }`}
        />
      )}
    </NodeViewWrapper>
  );
}
