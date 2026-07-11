/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        accent: {
          400: "#22c55e",
          500: "#16a34a",
          600: "#15803d",
        },
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
        },
        nio: {
          dark: "#0A1A0A",
          darker: "#111111",
          surface: "#141F14",
          muted: "#1C2B1C",
          neon: "#39FF14",
          "neon-dim": "#2DD410",
          "neon-glow": "#39FF1466",
          white: "#F5FFF5",
        },
        "neon-green": "#39FF14",
      },
      fontFamily: {
        sans: [
          "Plus Jakarta Sans",
          "Inter",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 4px 24px -4px rgba(15, 23, 42, 0.08)",
        "card-hover": "0 12px 40px -8px rgba(37, 99, 235, 0.18)",
        cta: "0 8px 24px -6px rgba(22, 163, 74, 0.35)",
        "neon-glow": "0 0 40px rgba(57, 255, 20, 0.35)",
        "neon-glow-lg": "0 0 60px rgba(57, 255, 20, 0.45)",
        "nio-card": "0 8px 32px -8px rgba(0, 0, 0, 0.4)",
        "nio-featured": "0 0 0 2px #39FF14, 0 12px 48px -8px rgba(57, 255, 20, 0.3)",
      },
      borderRadius: {
        "4xl": "2rem",
        pill: "9999px",
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        "float-slow": "float 9s ease-in-out infinite",
        "float-medium": "float 6s ease-in-out infinite",
        "float-fast": "float 4s ease-in-out infinite",
        "pulse-neon": "pulse-neon 3s ease-in-out infinite",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px) translateX(0px)" },
          "33%": { transform: "translateY(-18px) translateX(8px)" },
          "66%": { transform: "translateY(-8px) translateX(-6px)" },
        },
        "pulse-neon": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.7" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
