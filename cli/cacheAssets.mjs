/*!

All assets downloaded from the ASSET_SERVER_ORIGIN (url below)
are proprietary (NOT open-source), unless otherwise stated. 
Please DO NOT distribute assets or use them outside 
of anything related to Zakhaarif, unless you have explicit
permission to do so. 

Assets are freely available to ease the 
process of testing, debugging, and development of: 
    - Zakhaarif launcher
    - Zakhaarif game
    - Zakhaarif extensions/mods 
    - Zakhaarif-related projects

If you're unsure whether your use case falls under the above
conditions, please email me.

*/
import fetch from "node-fetch"
import Filehound from "filehound"
import path from "path"
import fs from "fs/promises"

const ASSET_SERVER_ORIGIN = "https://asset-archive.zakhaarif.com"
const TARGET_FOLDER = "public/large-assets"

const ASSET_LIST = [
    "hadramout-terrain.png",
    "hm-1025.png",
    "hm-painter-1025.png",
    "misc/bfdi-nine/source/model.gltf",
    "misc/bfdi-nine/textures/gltf_embedded_0.png",
    "misc/terrain-16bit.json",
]

/**
 * @returns {Promise<void>}
 */
async function main() {
    console.info(`fetching large assets from "${ASSET_SERVER_ORIGIN}" and outputting to "${TARGET_FOLDER}"`)
    console.info(`${ASSET_LIST.length} assets to cache...`)
    
    /** @type {string[]} */
    const currentAssets = await Filehound.create()
        .paths(TARGET_FOLDER)
        .find()
    const normalizedLocalFiles = currentAssets.map(
        (path) => path.split(TARGET_FOLDER)[1]
    )
    console.info(`found ${normalizedLocalFiles.length} cached assets`)
    const localAssetMap = new Map(
        normalizedLocalFiles.map((path) => [addSlashToStart(path), 1])
    )
    const remoteAssetMap = new Map(
        ASSET_LIST.map((path) => [addSlashToStart(path), 1])
    )
    
    /** @type {string[]} */
    const assetsToRequest = []
    for (const remoteUrl of remoteAssetMap.keys()) {
        if (!localAssetMap.has(remoteUrl)) {
            assetsToRequest.push(ASSET_SERVER_ORIGIN + remoteUrl)
        }
    }
    console.info(`${assetsToRequest.length} assets will be requested`)
    
    /** @type {string[]} */
    const assetsToDelete = []
    for (const localPath of localAssetMap.keys()) {
        if (!remoteAssetMap.has(localPath)) {
            const target = path.join(TARGET_FOLDER, localPath)
            assetsToDelete.push(target)
        }
    }
    console.info(`${assetsToDelete.length} assets will be deleted`)

    if (assetsToRequest.length < 1 && assetsToDelete.length < 1) {
        console.info(`No changes to make. Ending...`)
        return
    }

    const assets = await Promise.all(
        assetsToRequest.map(url => requestAsset(url))
    )
    /** @type {Response[]} */
    const filteredAssets = []
    for (const asset of assets) {
        if (asset) {
            filteredAssets.push(asset)
        }
    }
    const failedAssetRequestCount = assets.length - filteredAssets.length
    

    if (failedAssetRequestCount === 0) {
        console.info(`Successfully requested all assets`)
    }

    const createResponse = await Promise.all(filteredAssets.map(async (response) => {
        const {url} = response
        const relativeUrl = url.split(ASSET_SERVER_ORIGIN)[1]
        const filepath = path.join(TARGET_FOLDER, relativeUrl)
        try {
            await fs.writeFile(
                filepath,
                new Uint8Array(await response.arrayBuffer()), 
            )
            return true
        } catch (error) {
            console.error(error)
            return false
        }
    }))

    const createFailCount = createResponse.filter((ok) => !ok)

    if (createFailCount.length === 0) {
        console.info("Wrote all new assets to disk")
    } else {
        console.error(`failed to write ${createResponse.length - createFailCount.length} files to disk`)
    }

    if (failedAssetRequestCount > 0) {
        throw new Error(`failed to fetch ${failedAssetRequestCount} after multiple retries. Ending script...`)
    }

    await Promise.all(assetsToDelete.map((path) => fs.rm(path, {maxRetries: 1})))

    console.info(`Deleted ${assetsToDelete.length} files successfully`)
}

main()

/**
 * @param {string} path
 * @return {string} 
 */
function addSlashToStart(path) {
    return path.startsWith("/")
        ? path
        : "/" + path
}

/**
 * 
 * @param {string} url
 * @returns {Promise<{ok: boolean, payload: Response | null}>} 
 */
async function safeFetch(url) {
    try {
        /** @type {any} */
        const payload = await fetch(url, {method: "GET"})
        return {ok: true, payload}
    } catch {
        return {ok: false, payload: null}
    }
}

/**
 * @param {string} url
 * @returns {Promise<Response | null>} 
 */
async function requestAsset(url) {
    const retryCount = 3
    /** @type {{ok: boolean, payload: Response | null}} */
    let response = {ok: false, payload: null}
    for (let i = 0; i < retryCount; i++) {
        const attempt = await safeFetch(url)
        if (attempt.ok && attempt.payload?.ok) {
            return attempt.payload
        }
        response = attempt
    }
    if (!response.ok || !response.payload) {
        console.error(`request to "${url}" encountered network error (exception)`)
        return null
    }
    console.error(`request to "${url}" failed with status ${response.payload.status} (${response.payload.statusText})`)
    return null
}

