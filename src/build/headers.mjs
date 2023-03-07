import fs from "fs/promises"

const DEV_DEPLOYMENT_ORIGIN = process.env.DEV_DEPLOYMENT_ORIGIN || "none"
const MAIN_ORIGIN = process.env.MAIN_ORIGIN || "none"

const HEADERS_FOR_ALL_URLS = "/*"
const HEADERS_FOR_CLOUDFLARE_DEV_DEPLOYMENTS = "https://:project.pages.dev/*"

const file = `
${HEADERS_FOR_ALL_URLS}
    Access-Control-Allow-Origin: *
    ! X-Content-Type-Options

${HEADERS_FOR_CLOUDFLARE_DEV_DEPLOYMENTS}
    X-Robots-Tag: noindex

https://${DEV_DEPLOYMENT_ORIGIN}/*
    Access-Control-Allow-Origin: https://${DEV_DEPLOYMENT_ORIGIN}

${MAIN_ORIGIN}/
    Cross-Origin-Embedder-Policy: require-corp
    Cross-Origin-Opener-Policy: same-origin
    X-Frame-Options: deny
`.trim()


const CLOUDFLARE_HEADER_FILE = "_headers"
console.info("creating deployment headers...")

await fs.writeFile(`dist/${CLOUDFLARE_HEADER_FILE}`, file)

console.info(`successfully created headers!`)