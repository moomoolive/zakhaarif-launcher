import fs from "fs/promises"

const HEADERS_FOR_ALL_URLS = "/*"

const file = `
${HEADERS_FOR_ALL_URLS}
    Cross-Origin-Embedder-Policy: require-corp
    Cross-Origin-Opener-Policy: same-origin
    X-Content-Type-Options: nosniff
    X-Frame-Options: deny
`.trim()

const CLOUDFLARE_HEADER_FILE = "_headers"
console.log("creating deployment headers...")

await fs.writeFile(`dist/${CLOUDFLARE_HEADER_FILE}`, file)

console.info(`successfully created headers!`)