import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          500: "#3d63dd",
          600: "#2f4fc2",
          700: "#26409c",
        },
      },
    },
  },
  plugins: [],
};

export default config;
