import {
    MANIFEST_NAME,
    APP_CACHE,
    NO_EXPIRATION,
} from "./consts"
import {
    AppEntryPointers,
    CodeManifestSafe
} from "./types"
import {
    validateManifest, 
    entryRecords,
    appFolder,
    launcherCargo
} from "./utils"

const ENTRY_RECORDS_URL = entryRecords(window.location.href)
const LAUNCHER_CARGO = launcherCargo(window.location.href)

const enum log {
    name = "[👻 shabah]:"
}

const enum bytes {
    per_mb = 1_000_000
} 

export class io<T> {
    msg: string
    success: boolean
    data: T | null
  
    constructor(
      success: boolean,
      msg: string,
      data: T | null
    ) {
      this.success = success
      this.msg = msg
      this.data = data
    }
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
    init: RequestInit & {retryCount: number}
) => {
    return retryPromise(() => fetch(input, init), init.retryCount || 3)
}

const roundDecimal = (num: number, decimals: number) => {
    const factor = 10 ** decimals
    return Math.round(num * factor) / factor
}

const stringBytes = (str: string) => (new TextEncoder().encode(str)).length

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
    mode: ShabahModes,
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

type AppLauncher = {
    mount: () => void
    unMount: () => void
}

export class Shabah<Apps extends AppList> {
    readonly apps: Apps
    private tokenizedApps: (AppIndex & {name: string})[]
    requestEngine: "native-fetch"
    readonly mode: ShabahModes
    readonly appPointers: AppEntryPointers
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
    private launcher: AppLauncher | null

    constructor({apps, mode}: ShabahOptions<Apps>) {
        if (Object.keys(apps).length < 1) {
            throw new TypeError(`${log.name} one or more apps must be defined`)
        }
        const idRecord: Record<number, number> = {}
        for (const app of Object.values(apps)) {
            if (!idRecord[app.id]) {
                idRecord[app.id] = 1
            } else {
                throw new TypeError(`${log.name} app ids must be unique, app id ${app.id} was used twice or more`)
            }
        }
        this.apps = apps
        const self = this
        this.tokenizedApps = Object.keys(self.apps).map(k => ({name: k, ...self.apps[k]}))
        this.requestEngine = "native-fetch"
        this.mode = mode
        this.appPointers = {
            entryRecords: ENTRY_RECORDS_URL,
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
        this.launcher = null
        if (this.mode === "dev") {
            console.info(log.name, "dev mode detected, purging all cache files")
            caches.delete(APP_CACHE)
        }
    }

    private cache() {
        return caches.open(APP_CACHE) 
    }

    async checkForUpdates() {
        const apps = this.tokenizedApps
        const targetCache = await this.cache()
        let previousAppPtrs = await targetCache.match(ENTRY_RECORDS_URL)
        if (!previousAppPtrs) {
            console.info(log.name, "no previous app pointers found")
        } else {
            console.info(log.name, "previous app pointers found, diffing against new apps")
        }
        const failedManifestRequests: number[] = []
        const updatePromises = apps.map(async (app, i) => {
            const baseUrl = app.appRootUrl.endsWith("/")
                ? app.appRootUrl
                : app.appRootUrl + "/"
            const manifestUrl = baseUrl + MANIFEST_NAME
            const manifestRes = await fetchRetry(manifestUrl, {
                method: "GET",
                retryCount: 3
            })
            if (
                !manifestRes.data 
                || !manifestRes.success
                || !manifestRes.data.ok
            ) {
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
            const CURRENT_APP_DIR = appFolder(
                window.location.href, app.id
            )
            const appEntryUrl = CURRENT_APP_DIR + pkg.entry
            this.appPointers.entries.push({
                url: appEntryUrl,
                originalUrl: baseUrl + pkg.entry,
                name: app.name,
                id: app.id,
                bytes: totalAppSize
            })
            // insert manifest
            await this.cacheFile(
                targetCache,
                JSON.stringify(pkg),
                CURRENT_APP_DIR + MANIFEST_NAME,
                "application/json",
                manifestBytes
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
        const strRecords = JSON.stringify(this.appPointers)
        await this.cacheFile(
            targetCache,
            strRecords,
            ENTRY_RECORDS_URL,
            "application/json",
            stringBytes(strRecords)
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
        const targetCache = await this.cache()
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
                if (
                    !fileRes.data 
                    || !fileRes.success
                    || !fileRes.data.ok
                ) {
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
                await this.cacheFile(
                    targetCache,
                    await fileRes.data.text(),
                    cacheUrl,
                    fileRes.data.headers.get("content-type") || "text/plain",
                    bytes
                )
                console.info(log.name, `inserted file ${name} (${u.name}) into virtual drive (${cacheUrl})`)
            }
        }
    }

    defineLauncher<T extends AppLauncher>(launcher: T) {
        if (!this.launcher) {
            this.launcher = launcher
        } else {
            console.info(log.name, "launcher cannot be defined more than once")
        }
    }

    showLauncher() {
        if (this.launcher) {
            this.launcher.mount()
        } else {
            console.error(log.name, "{😼 show-launcher} launcher has not been defined yet")
        }
    }

    destroyLauncher() {
        if (this.launcher) {
            this.launcher.unMount()
        } else {
            console.error(log.name, "{🙀 destroy-launcher} launcher not defined yet")
        }
    }

    async launchApp(appKey: keyof Apps & string) {
        const ptrs = this.appPointers
        console.info(log.name, `app "${appKey}" has been requested to launch`)
        const app = ptrs.entries.find(({name}) => name === appKey)
        if (!app) {
            const msg = `app "${appKey}" does not exist`
            console.error(log.name, msg)
            return {success: false, msg}
        }
        // check if app entry file exists
        const entryPing = await fetchRetry(app.url, {
            method: "GET",
            retryCount: 3
        })
        if (
            !entryPing.data 
            || !entryPing.success
            || !entryPing.data.ok
        ) {
            const msg = `app "${appKey}" entry does not exist in virtual drive (/local).`
            console.error(log.name, msg)
            return {success: false, msg}
        }
        this.destroyLauncher()
        // apply permissions before import

        // this is a dynamic import, NOT code splitting
        await import(/* @vite-ignore */ app.url)
        console.info(log.name, `{📜 app-launcher} "${appKey}" has been launched`)
        return {success: true, msg: `${appKey} is open`}
    }

    private cacheFile(
        targetCache: Cache,
        fileText: string, 
        url: string,
        mimeType: string,
        bytes: number
    ) {
        return targetCache.put(url, new Response(fileText, {
            status: 200,
            statusText: "OK",
            headers: headers(mimeType, bytes)
        }))
    }

    async cacheLaucherAssets({
        rootHtmlDoc = "",
        rootHtmlUrl = "offline.html",
        cargoUrl = "cargo.json",
        useMiniCargoDiff = false,
        miniCargoUrl = ""
    } = {}) {
        const targetCache = await this.cache()
        const htmlDoc = rootHtmlDoc.length > 0
            ? rootHtmlDoc
            : "<!DOCTYPE html>\n" + document.documentElement.outerHTML
        const htmlBytes = stringBytes(htmlDoc)
        const htmlDocUrl = window.location.href + rootHtmlUrl
        await this.cacheFile(
            targetCache,
            htmlDoc,
            htmlDocUrl,
            "text/html",
            htmlBytes,
        )
        console.info(log.name, `cached root html document at ${htmlDocUrl}`)
        let previousManifest: CodeManifestSafe
        if (useMiniCargoDiff && miniCargoUrl.length > 0) {
            const miniManifestRes = await fetchRetry(miniCargoUrl, {
                method: "GET",
                retryCount: 3
            })
            if (!miniManifestRes.data || !miniManifestRes.data.ok) {
                console.error(log.name, "couldn't get mini manifest, reason", miniManifestRes.msg)
                return
            }
            

        } else if (useMiniCargoDiff && miniCargoUrl.length < 1) {
            console.error(log.name, `mini cargo url must be more than one character`)
            return
        }
        const manifestRes = await fetchRetry(cargoUrl, {
            method: "GET",
            retryCount: 1
        })
        if (!manifestRes.data || !manifestRes.data.ok) {
            console.error(log.name, `couldn't get launcher manifest, reason: ${manifestRes.msg}`)
            return
        }
        const {pkg, errors} = validateManifest(
            await manifestRes.data.json(),
            false
        )
        if (errors.length > 0) {
            console.error(log.name, "launcher manifest is incorrectly encoded, errors:", errors.join())
            return
        }
    }
}