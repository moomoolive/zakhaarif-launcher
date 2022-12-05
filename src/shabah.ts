import {io, roundDecimal, bytes, sleep} from "./utils"
import {
    MANIFEST_NAME,
    APP_CACHE,
    NO_EXPIRATION,
} from "../sharedLib/consts"
import {AppEntryPointers} from "../sharedLib/types"
import {
    validateManifest, 
    entryRecords,
    appFolder,
    CodeManifestSafe
} from "../sharedLib/utils"

const enum log {
    name = "[👻 shabah]:"
}

const retryPromise = async <T>(
    p: () => Promise<T>, 
    count: number
) => {
    let tryCount = 0
    let errorMsg = ""
    while (tryCount < count) {
      try {
        return new io(true, "sucess", await p())
      } catch (err) {
        if (tryCount >= count - 1) {
          errorMsg = (err as Error || "unknown error").toString()
        }
        tryCount++
      }
    }
    const msg = `Error fetching io operation after ${count} retries, err:${errorMsg}`
    console.error(log.name, msg)
    return new io(false, msg, null)
}

const fetchRetry = (
    input: RequestInfo | URL, 
    init?: RequestInit & {retryCount: number}
) => {
    return retryPromise(() => fetch(input, init), init?.retryCount || 3)
} 

type AppIndex = Readonly<{
    id: number,
    appRootUrl: string,
    htmlTitle: string
    permissions: Readonly<{

    }>
}>

type AppList = {
    readonly [key: string]: AppIndex
}

type ShabahModes = "dev" | "prod"

export type ShabahOptions<Apps extends AppList> = Readonly<{
    apps: Apps,
    entry: keyof Apps
    mode: ShabahModes
}>

const SHABAH_SOURCE = 1

const headers = (mimeType: string, contentLength: number) => {
    return {
        "Sw-Inserted-At": Date.now().toString(),
        "Sw-Expire-At": NO_EXPIRATION.toString(),
        "Sw-Source": "shabah",
        "Content-Length": contentLength.toString(),
        "Content-Type": mimeType,
        "Sw-Cache-Hit": SHABAH_SOURCE.toString()
    } as const
}

export class Shabah<Apps extends AppList> {
    readonly apps: Apps
    readonly entry: keyof Apps
    private tokenizedApps: (AppIndex & {name: string})[]
    requestEngine: "native-fetch"
    readonly mode: ShabahModes
    readonly appEntries: AppEntryPointers
    private updates: {
        id: number,
        totalBytes: number
        manifestsTotalBytes: number,
        partitions: {
            appId: number,
            name: string,
            manifest: CodeManifestSafe
            baseUrl: string,
            appDir: string
            totalBytes: number
            manifestBytes: number
        }[]
    }
    private updatesThisSession: number
    downloadingPartition: number

    constructor({apps, entry, mode}: ShabahOptions<Apps>) {
        if (Object.keys(apps).length < 1) {
            throw new TypeError(`${log.name} one or more apps must be defined`)
        }
        this.apps = apps
        if (!this.apps[entry]) {
            throw new TypeError(`${log.name} entry must be the name of an app. Apps: ${Object.keys(this.apps).join()}`)
        }
        this.entry = entry
        const self = this
        this.tokenizedApps = Object.keys(self.apps).map(k => ({name: k, ...self.apps[k]}))
        this.requestEngine = "native-fetch"
        this.mode = mode
        this.appEntries = {
            entryRecords: entryRecords(),
            entries: []
        }
        this.updates = {
            id: -1,
            totalBytes: 0,
            manifestsTotalBytes: 0,
            partitions: []
        }
        this.updatesThisSession = 0
        this.downloadingPartition = -1
    }

    async checkForUpdates() {
        const apps = this.tokenizedApps
        if (this.mode === "dev") {
            console.info(log.name, "dev mode detected, purging all cache files")
            await caches.delete(APP_CACHE)
        }
        const targetCache = await caches.open(APP_CACHE)
        let previousAppPtrs = await targetCache.match(entryRecords())
        if (!previousAppPtrs) {
            console.info(log.name, "no previous app pointers found")
        } else {
            console.info(log.name, "previous app pointers found, diffing against new apps")
        }
        const failedManifestRequests = []
        const updatePromises = apps.map(async (app, i) => {
            const baseUrl = app.appRootUrl.endsWith("/")
                ? app.appRootUrl
                : app.appRootUrl + "/"
            const manifestUrl = baseUrl + MANIFEST_NAME
            const manifestRes = await fetchRetry(manifestUrl, {
                method: "GET",
                retryCount: 3
            })
            if (!manifestRes.data || !manifestRes.success) {
                console.error(log.name, `couldn't get manifest for app "${app.name}", reason: ${manifestRes.msg}`)
                failedManifestRequests.push(i)
                return
            }
            // error check this
            const jsonManifest = await manifestRes.data.json()
            const {pkg, errors} = validateManifest(jsonManifest, true)
            if (errors.length > 0) {
                console.error(log.name, `manifest for "${app.name}" (${manifestUrl}) is not a valid ${MANIFEST_NAME} format. Errors: ${errors.join()}`)
                return
            }
            console.log(pkg)
            const manifestContentLength = manifestRes.data.headers.get("content-length")
            const manifestBytes = manifestContentLength 
                ? parseInt(manifestContentLength, 10)
                : 0
            const totalAppSize = pkg.files.reduce((total, {bytes}) => {
                return total + bytes
            }, manifestBytes)
            console.info(log.name, `successfully fetched "${app.name}" manifest, app_size is ${roundDecimal(totalAppSize / bytes.per_mb, 2)}mb`)
            const CURRENT_APP_DIR = appFolder(app.id)
            const appEntryUrl = CURRENT_APP_DIR + pkg.entry
            this.appEntries.entries.push({
                url: appEntryUrl,
                originalUrl: baseUrl + pkg.entry
            })
            // insert manifest
            await targetCache.put(
                CURRENT_APP_DIR + MANIFEST_NAME,
                new Response(JSON.stringify(pkg), {
                    status: 200,
                    statusText: "OK",
                    headers: headers("application/json", manifestBytes)
                })
            )
            console.info(log.name, `Inserted app entry ptr for "${app.name}" (ptr->${appEntryUrl})`)
            this.updates.partitions.push({
                appId: app.id,
                name: app.name,
                manifest: pkg,
                appDir: CURRENT_APP_DIR,
                totalBytes: totalAppSize,
                manifestBytes,
                baseUrl,
            })
        })
        await Promise.all(updatePromises)
        const strRecords = JSON.stringify(this.appEntries)
        const recordBytes = new TextEncoder()
            .encode(strRecords)
            .length
        await targetCache.put(
            entryRecords(),
            new Response(JSON.stringify(this.appEntries), {
                status: 200,
                statusText: "OK",
                headers: headers("application/json", recordBytes)
            })
        )
        this.updates.manifestsTotalBytes = this.updates
            .partitions
            .reduce((t, {manifestBytes}) => t + manifestBytes, 0)
        this.updates.totalBytes = this.updates
            .partitions
            .reduce((t, {totalBytes}) => t + totalBytes, 0)
        this.updates.id = ++this.updatesThisSession
    }

    updatesAvailable() {
        return this.updates.partitions.length > 0
    }

    async execUpdates({
        onProgress = () => {}
    }: {
        onProgress?: (params: {downloaded: number, total: number, latestFile: string, latestPartition: string}) => void
    }) {
        const updates = this.updates.partitions
        const targetCache = await caches.open(APP_CACHE)
        let downloaded = this.updates.manifestsTotalBytes
        for (let i = 0; i < updates.length; i++) {
            const u = updates[i]
            const failedRequests = []
            this.downloadingPartition = u.appId
            for (let f = 0; f < u.manifest.files.length; f++) {
                const {name, bytes} = u.manifest.files[f]
                const requestUrl = u.baseUrl + name
                const fileRes = await fetchRetry(requestUrl, {
                    method: "GET",
                    retryCount: 3
                })
                if (!fileRes.data || !fileRes.success) {
                    failedRequests.push({...fileRes, name, requestUrl})
                    continue
                }
                onProgress({
                    downloaded,
                    total:  this.updates.totalBytes,
                    latestFile: name,
                    latestPartition: u.name 
                })
                // reliable?
                downloaded += bytes
                const cacheUrl = u.appDir + name
                await targetCache.put(cacheUrl,
                    new Response(await fileRes.data.text(), {
                        status: 200,
                        statusText: "OK",
                        headers: headers(
                            fileRes.data.headers.get("content-type") || "text/plain",
                            bytes
                        )
                    })
                )
                console.info(log.name, `inserted file ${name} (${u.name}) into virtual drive (${cacheUrl})`)
            }
        }
    }
}