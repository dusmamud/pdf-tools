/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          active: 'var(--primary-active)',
        },
        surface: 'var(--surface)',
        'bg-soft': 'var(--bg-soft)',
      },
      textColor: {
        DEFAULT: 'var(--text)',
        secondary: 'var(--text-2)',
        hint: 'var(--text-3)',
      },
      borderColor: {
        DEFAULT: 'var(--border)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '"Noto Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
