const oneTwelth = (1 / 12)

const toPercent = (fraction = 0) => {
  return `${(fraction * 100)}%`
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      height: {
        "1/12": toPercent(oneTwelth * 1),
        "2/12": toPercent(oneTwelth * 2),
        "3/12": toPercent(oneTwelth * 3),
        "4/12": toPercent(oneTwelth * 4),
        "5/12": toPercent(oneTwelth * 5),
        "6/12": toPercent(oneTwelth * 6),
        "7/12": toPercent(oneTwelth * 7),
        "8/12": toPercent(oneTwelth * 8),
        "9/12": toPercent(oneTwelth * 9),
        "10/12": toPercent(oneTwelth * 10),
        "11/12": toPercent(oneTwelth * 11),
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        wiggle: 'wiggle 1s ease-in-out infinite',
        swing: "swing 1s ease infinite",
        "fade-in-left": "fade-in-left 0.5s forwards",
        "fade-out-left": "fade-out-left 0.5s forwards"
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
        "fade-in-left": {
          from: {
            opacity: 0,
            transform: "translate(-20px, 0)"
          },
          to: {
            opacity: 1,
            transform: "translate(0px, 0)"
          }
        },
        "fade-out-left": {
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
