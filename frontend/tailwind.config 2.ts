import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Sora", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      colors: {
        brand: {
          50: "#edf8ff",
          100: "#d7efff",
          200: "#b4e3ff",
          300: "#83d3ff",
          400: "#43bdff",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e"
        }
      },
      boxShadow: {
        panel: "0 12px 24px -12px rgba(2, 132, 199, 0.4)"
      }
    }
  },
  plugins: []
};

export default config;
