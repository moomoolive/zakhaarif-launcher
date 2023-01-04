/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        wiggle: 'wiggle 1s ease-in-out infinite',
        swing: "swing 1s ease infinite"
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { 
            transform: 'rotate(-3deg)',
            "animation-timing-function": "cubic-bezier(0.8, 0, 1, 1)" 
          },
          '50%': { 
            transform: 'rotate(3deg)',
            "animation-timing-function": "cubic-bezier(0, 0, 0.2, 1)" 
          },
        },
        swing: {
          "0%, 100%" : {transform: "translateX(8%)"},
          "50%" : {transform: "translateX(-8%)"},
        }
      }
    },
  },
  plugins: [],
}
