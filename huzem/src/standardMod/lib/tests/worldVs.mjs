const vertexCount = 40_000
const floatsPerVertex = 3
const bytesPerFloat = 4
const vertexBytes = vertexCount * floatsPerVertex * bytesPerFloat
const colorBytes = vertexBytes
const normalBytes = vertexBytes
const meshBytes = vertexBytes + colorBytes + normalBytes
const bytesPerMegabyte = 1_000_000
const meshMb = meshBytes/bytesPerMegabyte
const meshes = (4096 / 64) ** 2

console.info(
    `mesh: ${meshMb}mb,`,
    `lod1: ${meshMb * meshes}mb`
)