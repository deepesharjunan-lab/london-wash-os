import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // London Wash Club palette: deep navy, warm ivory, soft beige, muted brass.
        accent: "#15213a",
        ink: "#1a1d23",
        "ink-2": "#5b574f",
        "ink-3": "#8a857a",
        paper: "#f3f2f2", // kept for print routes, which render on the root body
        ivory: "#f8f5ef",
        beige: "#f2ede4",
        hair: "#e3dbcd",
        "hair-2": "#d2c8b6",
        navy: "#15213a",
        brass: "#9a8358",
        "brass-2": "#c7b58f",
        sidebar: "#101828",
      },
      fontFamily: {
        archivo: ["var(--font-ui)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        md2: "12px",
        lg2: "18px",
      },
    },
  },
  plugins: [],
};

export default config;
