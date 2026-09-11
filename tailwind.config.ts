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
        accent: "#ec3013",
        ink: "#1a1817",
        paper: "#f3f2f2",
        sidebar: "#201e1d",
      },
      fontFamily: {
        archivo: ["Archivo", "sans-serif"],
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
