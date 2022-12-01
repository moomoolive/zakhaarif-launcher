import type {CodeManifest} from "../types"
import {appShell} from "../logging/index"
import {roundDecimal} from "../math/index"
import {db} from "../storage/db"
import {bytes, MANIFEST_NAME} from "../consts"

type UpdateParams = {
    manifestUrl: string
}

export const updateStdFiles = async ({
    manifestUrl
}: UpdateParams) => { 
    const baseUrl = manifestUrl.split(MANIFEST_NAME)[0] || ""
    const [currentStdPkg, manifestRes] = await Promise.all([
        db.packages.findByName("std"),
        fetch(manifestUrl, {method: "GET"})
    ])
    const contentLength = manifestRes.headers.get("content-length")
    const manifestSize = contentLength 
        ? parseInt(contentLength, 10) 
        : 0 
    const latestManifest = await manifestRes.json() as CodeManifest
    const isUpToDate = currentStdPkg?.version === latestManifest.version
    if (isUpToDate) {
        appShell.info("app is already update to date!")
        return {status: "success"}
    }
    const filesToDownload = [
        manifestUrl,
        ...latestManifest.files.map(({name}) => baseUrl + name)
    ]
    const payloadSize = latestManifest.files.reduce((total, {bytes}) => {
        return parseFloat(bytes) + total
    }, manifestSize)
    const payloadSizeMb = roundDecimal(payloadSize / bytes.per_mb, 2)

    const firstTimeAccessingApp = !currentStdPkg
    if (firstTimeAccessingApp) {
        appShell.info(`app has not been downloaded yet. Downloading current verison: version=${latestManifest.version}, name=${latestManifest.name}, size=${payloadSizeMb}mb, files=${filesToDownload.length}`)
        await db.packages.create({
            uuid: latestManifest.uuid,
            name: latestManifest.name,
            version: latestManifest.version,
            type: "mod",
            description: latestManifest.description || "no description",
            authors: latestManifest.authors || "no author",
            entry: latestManifest.entry,
            displayPictureUrl: latestManifest.displayPictureUrl || "default",
            url: baseUrl,
            files: latestManifest.files.map((f) => {
                return {...f, bytes: parseFloat(f.bytes)}
            }),
            createdAt: new Date(),
            updatedAt: new Date(),
            meta: {
                source: "default_repo",
                bytes: payloadSize,
                schemaVersion: latestManifest.schemaVersion
            }
    })
        appShell.info("download complete...")
    } else {
        appShell.info(`app is not up to date current=${currentStdPkg.version}, current=${latestManifest.version}. Updating now...`)
    }
    return {status: "success"}
}