const bytesPerElement = 2
const maxColsize = 12
const bytesPerCol = (bytesPerElement * maxColsize) + 1
const colsPerChunk = 16
const rowsPerChunk = colsPerChunk
const worldX = 4096
const worldZ = worldX

const bytes_per_mb = 1_000_000
const ram = (
    bytesPerCol
    * worldX
    * worldZ
) / bytes_per_mb

const mb_per_gb = 1_000
console.log(
    "world is", ram.toLocaleString("en-us"), "mbs",
    `(${(ram / mb_per_gb).toFixed(2)} gbs)`,
    `| chunks = ${(worldX / colsPerChunk) ** 2}`,
    `collider_col = ${(bytesPerCol * worldZ * colsPerChunk) / bytes_per_mb} mbs`
)