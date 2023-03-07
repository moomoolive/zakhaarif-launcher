// @ts-check
import {readFile, writeFile} from "fs/promises"
import {decode} from "fast-png"

const OUTFILE = "../../assets/terrain-16bit.json"
const imageFile = await readFile("../../assets/hm-1025.png")
const image = decode(imageFile.buffer)
console.info(
    "found png file with params", 
    image.width, "x", image.height
)
let low = 1_000_000
let high = 0
for (let d of image.data) {
    if (d > high) {
        high = d
    } 
    if (d < low) {
        low = d
    }
}
console.info("high", high, "low", low)
const data = []
for (let i = 0; i < image.data.length; i++) {
    data.push(image.data[i])
}

await writeFile(OUTFILE, JSON.stringify({
    height: image.height,
    width: image.width,
    high: 1_024,
    data,
}))
console.info("outputted file to", OUTFILE)