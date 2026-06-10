/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        bg: v('--bg'),
        surface: v('--surface'),
        surface2: v('--surface-2'),
        line: v('--border'),
        content: v('--content'),
        contentsoft: v('--content-soft'),
        muted: v('--muted'),
        muted2: v('--muted-2'),
        accent: v('--accent'),
        accentstrong: v('--accent-strong'),
        accentfg: v('--accent-fg'),
        white: v('--surface'),
        paper: v('--bg'),
        ink: { DEFAULT: v('--content'), soft: v('--content-soft') },
        neutral: {
          50: v('--surface-2'),
          100: v('--surface-2'),
          200: v('--border'),
          300: v('--border'),
          400: v('--muted-2'),
          500: v('--muted'),
          600: v('--content-soft'),
          700: v('--content-soft'),
          800: v('--content'),
          900: v('--content'),
        },
      },
      borderRadius: { md: '8px', lg: '12px', xl: '16px' },
      fontSize: { '2xs': '11px' },
    },
  },
  plugins: [],
};
