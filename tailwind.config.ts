import type { Config } from "tailwindcss";

// 顏色/圓角/字體全部對應 CSS 變數(定義於 src/app/globals.css),
// 變數本身的值與命名規則見 ../design.md 第二、三節。
// 不要在這裡硬寫色碼——新增顏色一律先加變數,再在這裡映射成 Tailwind token。
const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        border: "var(--border)",
        text: {
          DEFAULT: "var(--text)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
        },
        profit: {
          DEFAULT: "var(--profit)",
          bg: "var(--profit-bg)",
          "bg-strong": "var(--profit-bg-strong)",
        },
        loss: {
          DEFAULT: "var(--loss)",
          bg: "var(--loss-bg)",
          "bg-strong": "var(--loss-bg-strong)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          bg: "var(--warning-bg)",
        },
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
      },
      fontFamily: {
        sans: ["var(--font)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
