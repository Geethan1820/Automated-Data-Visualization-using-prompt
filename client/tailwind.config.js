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
        primary: "#4f46e5",
        secondary: "#64748b",
        accent: "#14b8a6",
        dark: "#0f172a",
        light: "#f8fafc"
      }
    },
  },
  plugins: [],
}
