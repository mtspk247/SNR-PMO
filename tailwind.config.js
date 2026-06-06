/** @type {import('next').NextConfig} */
module.exports = {
  content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        ink: { DEFAULT: '#1c1b19', soft: '#403e3a' },
        paper: '#f7f6f3',
        line: '#e8e6e1',
      },
      borderRadius: { md: '8px', lg: '12px', xl: '16px' },
      fontSize: { '2xs': '11px' },
    },
  },
  plugins: [],
};
