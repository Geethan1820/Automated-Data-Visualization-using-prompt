/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#3b82f6",
        secondary: "#64748b",
        accent: "#8b5cf6",
        dark: "#1e293b",
        light: "#f8fafc"
      }
    },
  },
  plugins: [],
}
