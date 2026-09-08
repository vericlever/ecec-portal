import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Bauhaus palette for the public site (landing + sign-in). Additive - the
      // portal keeps its slate/amber Tailwind defaults.
      colors: {
        paper: "#FFFFFF",
        ink: {
          DEFAULT: "#1A1A17",
          muted: "#45423A",
          faint: "#6B6659",
        },
        policy: "#1F51A8",
        procedure: { DEFAULT: "#C98A0E", text: "#9A6A08" },
        training: "#C8451F",
        outcomes: { DEFAULT: "#1B7A3E", hover: "#166533", "on-dark": "#6FBF8B" },
      },
      fontFamily: {
        jost: ["var(--font-jost)", "Helvetica", "Arial", "sans-serif"],
        "plex-mono": ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
