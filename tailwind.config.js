/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dfeaff',
          500: '#3b82f6',
          700: '#1d4ed8',
          900: '#172554',
        },
      },
      boxShadow: {
        soft: '0 10px 25px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [],
};
