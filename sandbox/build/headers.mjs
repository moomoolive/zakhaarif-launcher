import fs from "fs/promises"

const DEV_DEPLOYMENT_ORIGIN = process.env.DEV_DEPLOYMENT_ORIGIN || "none"
const MAIN_ORIGIN = process.env.MAIN_ORIGIN || "none"
const SANDBOX_ORIGIN = process.env.SANDBOX_ORIGIN || "none"

const HEADERS_FOR_ALL_URLS = "/*"
const HEADERS_FOR_CLOUDFLARE_DEV_DEPLOYMENTS = "https://:project.pages.dev/*"

const file = `
${HEADERS_FOR_ALL_URLS}
    Cross-Origin-Embedder-Policy: require-corp
    Cross-Origin-Opener-Policy: same-origin
    X-Content-Type-Options: nosniff
    X-Frame-Options: deny
    Vary: Origin

${HEADERS_FOR_CLOUDFLARE_DEV_DEPLOYMENTS}
    X-Robots-Tag: noindex

https://${DEV_DEPLOYMENT_ORIGIN}/*
    Access-Control-Allow-Origin: https://${DEV_DEPLOYMENT_ORIGIN}

${MAIN_ORIGIN}/*
    Access-Control-Allow-Origin: ${MAIN_ORIGIN}

https://:deployment.${DEV_DEPLOYMENT_ORIGIN}/*
    Access-Control-Allow-Origin: https://:deployment.${DEV_DEPLOYMENT_ORIGIN}

${SANDBOX_ORIGIN}/*
    Access-Control-Allow-Origin: ${SANDBOX_ORIGIN}
`.trim()


const CLOUDFLARE_HEADER_FILE = "_headers"
console.log("creating deployment headers...")
console.log("deployment headers =", file)

await fs.writeFile(`dist-sandbox/${CLOUDFLARE_HEADER_FILE}`, file)

console.info(`successfully created headers!`)