/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './script.js'],
  theme: {
    extend: {
      colors: {
        claire: {
          ink: '#10120F',
          cream: '#F4F1EA',
          paper: '#FFFDF8',
          lime: '#DFFF64',
          sky: '#B9DCFF',
          blush: '#F2CFE1',
          coral: '#FF745F',
          lavender: '#D8CCFF',
          mint: '#BDEBD5',
        },
      },
      fontFamily: {
        sans: ['Public Sans', 'Avenir Next', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['DM Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      borderRadius: { claire: '1.25rem', panel: '2rem', feature: '3rem' },
      boxShadow: {
        claire: '0 14px 32px rgb(16 18 15 / 10%)',
        'claire-lg': '0 30px 80px rgb(16 18 15 / 14%)',
      },
    },
  },
};
