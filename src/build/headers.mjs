import fs from "fs/promises"

const HEADERS_FOR_ALL_URLS = "/*"
const HEADERS_FOR_CLOUDFLARE_DEV_DEPLOYMENTS = "https://:project.pages.dev/*"

const file = `
${HEADERS_FOR_ALL_URLS}
    Access-Control-Allow-Origin: *
    Cross-Origin-Embedder-Policy: require-corp
    Cross-Origin-Opener-Policy: same-origin
    X-Frame-Options: deny

${HEADERS_FOR_CLOUDFLARE_DEV_DEPLOYMENTS}
    X-Robots-Tag: noindex
`.trim()


const CLOUDFLARE_HEADER_FILE = "_headers"
console.info("creating deployment headers...")

await fs.writeFile(`dist/${CLOUDFLARE_HEADER_FILE}`, file)

console.info(`successfully created headers!`)