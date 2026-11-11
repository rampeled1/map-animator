/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fbf7ee',
          100: '#f5eddc',
          200: '#ebd9b9',
          500: '#b5492f',
          600: '#9c2f22',
        }
      },
      width: {
        85: '21.25rem',
      },
    },
  },
  plugins: [],
}
