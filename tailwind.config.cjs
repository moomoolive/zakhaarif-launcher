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
        swing: "swing 1s ease infinite",
        "fade-in": "fade-in 0.5s forwards",
        "fade-out": "fade-out 0.5s forwards"
      },
      keyframes: {
        wiggle: {
          '0%, 100%': {transform: 'rotate(-3deg)'},
          '50%': {transform: 'rotate(3deg)'},
        },
        swing: {
          "0%, 100%" : {
            transform: "translateX(8%)",
            "animation-timing-function": "cubic-bezier(0.8, 0, 1, 1)"
          },
          "50%" : {
            transform: "translateX(-8%)",
            "animation-timing-function": "cubic-bezier(0, 0, 0.2, 1)" 
          },
        },
        "fade-in": {
          from: {
            opacity: 0,
            transform: "translate(-20px, 0)"
          },
          to: {
            opacity: 1,
            transform: "translate(0px, 0)"
          }
        },
        "fade-out": {
          from: {
            opacity: 1,
            transform: "translate(0px, 0)"
          },
          to: {
            opacity: 0,
            transform: "translate(-20px, 0)"
          }
        }
      }
    },
  },
  plugins: [],
}
