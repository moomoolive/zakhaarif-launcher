const oneTwelth = (1 / 12) * 100

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      height: {
        "1/12": (oneTwelth * 1).toString() + "%",
        "2/12": (oneTwelth * 2).toString() + "%",
        "3/12": (oneTwelth * 3).toString() + "%",
        "4/12": (oneTwelth * 4).toString() + "%",
        "5/12": (oneTwelth * 5).toString() + "%",
        "6/12": (oneTwelth * 6).toString() + "%",
        "7/12": (oneTwelth * 7).toString() + "%",
        "8/12": (oneTwelth * 8).toString() + "%",
        "9/12": (oneTwelth * 9).toString() + "%",
        "10/12": (oneTwelth * 10).toString() + "%",
        "11/12": (oneTwelth * 11).toString() + "%",
      },
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
