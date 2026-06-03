/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pitch: {
          950: '#04060c',
          900: '#0a0f1f',
          800: '#0f1730',
          700: '#172244',
          600: '#1f2d5a',
        },
        neon: {
          green: '#00ff85',
          gold: '#ffc83a',
        },
      },
      fontFamily: {
        display: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(0, 255, 133, 0.25)',
        gold: '0 0 24px rgba(255, 200, 58, 0.25)',
      },
    },
  },
  plugins: [],
};
