import jimp from "jimp"
import {writeFile} from "fs/promises"

const OUTPUT_FILE = "output-png.json"

const image = await jimp.read("../../assets/hadramout-terrain.png")
const {height, width, data: buf} = image.bitmap
console.info(`detected image with h=${height}, w=${width}`)
const data = []
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const ptr = image.getPixelIndex(x, y)
        const height = buf[ptr]
        data.push(height)
    }
}
console.info(`output array contains ${data.length} pixels (${width}x${height}). Writing to disc!`)
const stringified = JSON.stringify({height, width, data})
await writeFile(OUTPUT_FILE, stringified)
console.info("successfully wrote json image to", OUTPUT_FILE)