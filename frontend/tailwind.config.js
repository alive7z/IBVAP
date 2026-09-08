/** @type {import('tailwindcss').Config} */

const slateShades = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
];

const slate = slateShades.reduce((acc, shade) => {
  acc[shade] = `rgb(var(--c-slate-${shade}) / <alpha-value>)`;
  return acc;
}, {});

export default {
  darkMode: "class",

  content: ["./index.html", "./src/**/*.{js,jsx}"],

  theme: {
    extend: {
      colors: {
        slate,

        white: "rgb(var(--c-white) / <alpha-value>)",

        // Main IBVAP blue palette
        blue: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB", // Primary
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
          950: "#172554",
        },

        // Semantic colors
        success: "#16A34A",
        warning: "#F59E0B",
        danger: "#DC2626",
        info: "#2563EB",

        // Optional security/status colors
        critical: "#DC2626",
        high: "#EA580C",
        medium: "#F59E0B",
        low: "#2563EB",
      },

      boxShadow: {
        card: "0 1px 3px rgba(16, 24, 40, 0.06), 0 1px 2px rgba(16, 24, 40, 0.04)",
        lift: "0 4px 12px rgba(16, 24, 40, 0.10)",
        pop: "0 8px 30px rgba(16, 24, 40, 0.16)",
      },

      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "sans-serif",
        ],
      },

      transitionDuration: {
        250: "250ms",
      },
    },
  },

  plugins: [],
};
