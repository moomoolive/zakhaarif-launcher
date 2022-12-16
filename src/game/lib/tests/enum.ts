const COLOR = {
    blue: 1,
    red: 2,
    green: 3
} as const

type Enum<
    T extends Readonly<{[key: string]: number}>
> = T[keyof T]

type Color = Enum<typeof COLOR>

const c = (color: Color) => color

const {blue, red} = COLOR

const op = () => {
    if (Math.random() > 0.5) {
        return red
    }
    const color = c(blue)
    return color
}
