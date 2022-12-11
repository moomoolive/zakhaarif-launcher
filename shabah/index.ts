import {AppEntryPointers} from "./types"
import {
    fetchRetry,
    persistAssetList,
    FileRef,
} from "./utils"
import {
    validateManifest,
    CodeManifestSafe,
    NULL_MANIFEST_VERSION,
    cargoIsUpdatable,
    diffManifestFiles
} from "../cargo/index"
import {MANIFEST_NAME} from "../cargo/consts"
import {
    APP_INDEX, 
    VIRTUAL_DRIVE,
    PARTIAL_UPDATES,
    LAUNCHER_PARTIAL_UPDATES,
    APP_RECORDS,
    LAUNCHER_CARGO as LAUNCHER_CARGO_EXTENSION,
    APPS_FOLDER,
} from "./consts"
import {io, Result} from "../monads/result"
import {urlToMime, Mime} from "../miniMime/index"

const ENTRY_RECORDS_URL = window.location.origin + "/" + APP_RECORDS
const LAUNCHER_CARGO = window.location.origin + "/" + LAUNCHER_CARGO_EXTENSION
const APP_INDEX_URL = window.location.origin + "/" + APP_INDEX
const UPDATES_BACKUP_URL = window.location.origin + "/" + PARTIAL_UPDATES

const appFolder = (windowOrigin: string, appId: number) => windowOrigin + "/" + APPS_FOLDER + appId.toString() + "/"
const appManifestUrl = (appId: number) => appFolder(window.location.origin, appId) + MANIFEST_NAME

const enum log {
    name = "[👻 shabah]:"
}

const enum bytes {
    per_mb = 1_000_000
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
    permissions: Readonly<{}>
}>

type AppList = {
    readonly [key: string]: AppIndex
}

type ShabahModes = "dev" | "prod"

const SHABAH_SOURCE = 1

const headers = (mimeType: string, contentLength: number) => {
    return {
        "Last-Modified": new Date().toUTCString(),
        "Sw-Source": SHABAH_SOURCE.toString(),
        "Content-Length": contentLength.toString(),
        "Content-Type": mimeType,
        "Sw-Cache-Hit": SHABAH_SOURCE.toString()
    } as const
}

type AppLauncher = {
    mount: () => void
    unMount: () => void
}

const fetchManifestFromUrl = async (name: string, rootUrl: string) => {
    const baseUrl = rootUrl.endsWith("/")
        ? rootUrl
        : rootUrl + "/"
    const manifestUrl = baseUrl + MANIFEST_NAME
    const manifestRes = await fetchRetry(manifestUrl, {
        method: "GET",
        retryCount: 3
    })
    if (!manifestRes.ok) {
        console.error(log.name, `couldn't get manifest for app "${name}", reason: ${manifestRes.msg}`)
        return manifestRes
    }
    const jsonManifestRes = await io.wrap(manifestRes.data.json())
    if (!jsonManifestRes.ok) {
        console.log(log.name, `manifest for ${name} was encoded as json`)
        return jsonManifestRes
    }
    const manifest = validateManifest(jsonManifestRes.data)
    return Result.ok({
        manifest, 
        size: parseInt(manifestRes.data.headers.get("content-length") || "0", 10)
    })
}

type FileRefs = {
    name: string, 
    bytes: number,
    requestUrl: string,
    storageUrl: string,
}[]

type UpdateDetails = { delete: FileRefs, add: FileRefs }

const stripRelativePath = (url: string) => {
    if (url.startsWith("/")) {
        return url.slice(1)
    } else if (url.startsWith("./")) {
        return url.slice(2)
    } else {
        return url
    }
}

type AppUpdates = {
    id: number,
    totalBytes: number,
    bytesCompleted: number
    bytesToAdd: number,
    bytesToDelete: number,
    manifestsTotalBytes: number,
    failedRequests: number,
    partitions: {
        appId: number,
        name: string,
        manifest: Omit<CodeManifestSafe, "clone">
        baseUrl: string,
        appDir: string
        totalBytes: number
        manifestBytes: number
        details: UpdateDetails
        addBytes: number
        deleteBytes: number
    }[]
}

type UpdateOnProgressParams = {
    downloaded: number, 
    total: number, 
    latestFile: string, 
    latestPartition: string,
    attemptCount: number
}

type UpdateOptions = {
    onProgress?: (params: UpdateOnProgressParams) => void
}

type RequestEngineType = (
    "fetch"
    | "background-fetch"
)

const deepCopy = <T>(val: T) => JSON.parse(JSON.stringify(val)) as T

const deleteCacheFiles = (cache: Cache, files: {storageUrl: string}[]) => {
    return Promise.all(files.map(({storageUrl}) => cache.delete(storageUrl)))
}

export class Shabah<Apps extends AppList> {
    readonly apps: Apps
    private tokenizedApps: Array<(
        Readonly<AppIndex> & Readonly<{
            name: string
        }>
    )>
    requestEngine: RequestEngineType
    readonly mode: ShabahModes
    readonly appPointers: AppEntryPointers
    private updates: AppUpdates
    private updatesThisSession: number
    downloadingPartition: number
    private launcher: AppLauncher | null
    readonly cacheName: string
    private rootHtmlDoc: string
    private logger: {
        warn: (...args: any[]) => void
        info: (...args: any[]) => void
    }
    loggingMode: "verbose" | "silent"

    constructor({
        apps, 
        mode, 
        cacheName, 
        previousCaches = [],
        loggingMode = "silent"
    }: Readonly<{
        apps: Apps,
        mode: ShabahModes,
        cacheName: string,
        previousCaches?: string[],
        loggingMode?: "verbose" | "silent"
    }>) {
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
        this.requestEngine = "fetch"
        this.mode = mode
        this.appPointers = {
            entryRecords: ENTRY_RECORDS_URL,
            entries: []
        }
        this.updates = {
            id: -1,
            totalBytes: 0,
            bytesCompleted: 0,
            manifestsTotalBytes: 0,
            bytesToDelete: 0,
            bytesToAdd: 0,
            failedRequests: 0,
            partitions: []
        }
        this.updatesThisSession = 0
        this.downloadingPartition = -1
        this.launcher = null
        this.cacheName = cacheName
        for (const prevCache of previousCaches) {
            caches.delete(prevCache)
        }
        if (this.mode === "dev") {
            console.info(log.name, "dev mode detected, purging current cache")
            caches.delete(this.cacheName)
        }
        this.loggingMode = loggingMode
        this.rootHtmlDoc = "<!DOCTYPE html>\n" + document.documentElement.outerHTML
        this.logger = {
            warn: (...msgs: any[]) => console.warn(log.name, ...msgs),
            info: (...msgs: any[]) => console.info(log.name, ...msgs),
        }
    }

    private createUpdateId() {
        return Math.round(Math.random() * 1_000_000)
    }

    private cache() {
        return caches.open(this.cacheName) 
    }

    private async findUpdatableApps() {
        const targetCache = await this.cache()
        let appListFile = await targetCache.match(APP_INDEX_URL)
        if (!appListFile) {
            console.info(log.name, "no previous app pointers found")
        } else {
            console.info(log.name, "previous app pointers found, diffing against new apps")
        }
        const previousAppsJson = await io.wrap(
            (appListFile || new Response(JSON.stringify(this.tokenizedApps))).json()
        )
        if (!previousAppsJson.ok && appListFile) {
            return io.err(`${log.name} previous app list found but couldn't parse correctly, json encoded incorrectly?`)
        }
        const apps = this.tokenizedApps
        type AppListTokens = typeof this.tokenizedApps
        const previousApps = previousAppsJson.data as AppListTokens
        const currentAppIds: Record<number, boolean> = {}
        const appsToUpdate: Array<
            AppListTokens[number] & {
            previousCargo: CodeManifestSafe,
        }> = []

        const garbageId = "5BEFrw4X8I8LJWNQ8pUVtpTQV44co2RIzes"
        const packageThatForcesUpdate = new CodeManifestSafe({
            uuid: garbageId,
            name: "new-pkg",
            version: NULL_MANIFEST_VERSION
        })
        await Promise.all(apps.map(async (app) => {
            currentAppIds[app.id] = true
            const manifestUrl = appManifestUrl(app.id)
            const prevCargoFile = await targetCache.match(manifestUrl)
            if (!prevCargoFile) {
                console.info(log.name, `previous cargo not found for app ${app.name}`)
                appsToUpdate.push({
                    ...app, 
                    previousCargo: packageThatForcesUpdate
                })
                return
            }
            const previousCargo = await prevCargoFile.json() as CodeManifestSafe
            appsToUpdate.push({...app, previousCargo})
        }))

        const deletePromises = [] as Promise<boolean>[]
        for (const prevApp of previousApps) {
            if (currentAppIds[prevApp.id]) {
                continue
            }
            const manifestUrl = appManifestUrl(prevApp.id)
            const prevCargoFile = await targetCache.match(manifestUrl)
            if (!prevCargoFile) {
                console.warn(log.name, `app "${prevApp.name}" (id=${prevApp.id}) was previously an app, but found no manifest for it.`)
                continue
            }
            const cargoJson = await io.wrap(prevCargoFile.json())
            if (!cargoJson.ok) {
                console.warn(log.name, `found cargo.json for "${prevApp.name}" (id=${prevApp.id}) but couldn't parse it.`)
                continue
            }
            const {errors, pkg} = validateManifest(cargoJson)
            if (errors.length > 0) {
                console.warn(log.name, `cargo.json for "${prevApp.name}" (id=${prevApp.id}) is not a valid cargo.json`)
                continue
            }
            const storageRootUrl = appFolder(
                window.location.origin, prevApp.id
            )
            // delete all files for stale app

            const pkgDeleteFiles = pkg.files.map((f) => {
                return targetCache.delete(storageRootUrl + f.name)
            })
            deletePromises.push(...pkgDeleteFiles)
            console.info(log.name, `successfully deleted files for stale app "${prevApp.id}" (id=${prevApp.id})`)
        }
        await Promise.all(deletePromises)
        return io.ok(appsToUpdate)
    }

    async checkForUpdates() {
        const targetCache = await this.cache()
        const updatableAppsRes = await this.findUpdatableApps()
        if (!updatableAppsRes.ok) {
            return updatableAppsRes
        }
        const {data: appsToUpdate} = updatableAppsRes
        const partialUpdatesFile = await targetCache.match(
            UPDATES_BACKUP_URL
        )
        const partialUpdate = partialUpdatesFile 
            ? await partialUpdatesFile.json() as AppUpdates
            : null
        const updatePromises = appsToUpdate.map(async (app) => {
            const pkgRes = await fetchManifestFromUrl(
                app.name, app.appRootUrl
            )
            if (!pkgRes.ok || !pkgRes.data.manifest) {
                return io.err(`pkg ${app.name} (id=${app.id}) could not fetch new manifest. aborting update. reason: ${pkgRes.msg}`)
            }
            const {manifest, size} = pkgRes.data
            const baseUrl = app.appRootUrl.endsWith("/")
                ? app.appRootUrl
                : app.appRootUrl + "/"
            const {
                newManifest, oldManifest, updateAvailable
            } = cargoIsUpdatable(manifest.pkg, app.previousCargo)
            const partialUpdateIndex = partialUpdate 
                ? partialUpdate.partitions.findIndex(({appId}) => appId === app.id)
                : -1
            if (
                newManifest.errors.length > 0
                || oldManifest.errors.length > 0
            ) {
                return io.err(`${log.name} err occurred when checking for update. old-cargo encoded correctly=${oldManifest.errors.length < 1}, errs=${oldManifest.errors.join()}. new-cargo is encoded correctly=${newManifest.errors.length < 1}, errs=${newManifest.errors.join()}`)
            } else if (!updateAvailable) {
                console.info(log.name, `app "${app.name}" is update to date (v=${oldManifest.pkg.version})`)
                if (
                    partialUpdate 
                    && partialUpdateIndex !== -1
                    && partialUpdate.partitions[partialUpdateIndex].details.add.length > 0
                ) {
                    const partialPartition = partialUpdate.partitions[partialUpdateIndex]
                    this.updates.partitions.push(partialPartition)
                }
                return io.ok({})
            }
            const {pkg} = newManifest
            const manifestBytes = size
            const totalAppSize = pkg.files.reduce((total, {bytes}) => {
                return total + bytes
            }, manifestBytes)
            console.info(log.name, `successfully fetched "${app.name}" manifest, app_size is ${Math.max(roundDecimal(totalAppSize / bytes.per_mb, 2), 0.01)}mb`)
            const CURRENT_APP_DIR = appFolder(
                window.location.origin, app.id
            )
            const appEntryUrl = CURRENT_APP_DIR + pkg.entry
            const prevPtr = this.appPointers.entries.findIndex(({id}) => app.id === id)
            if (prevPtr !== -1) {
                this.appPointers.entries.splice(prevPtr, 1)
            }
            this.appPointers.entries.push({
                url: appEntryUrl,
                originalUrl: baseUrl + pkg.entry,
                name: app.name,
                id: app.id,
                version: pkg.version,
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
            const manifestDifferences = diffManifestFiles(
                newManifest.pkg,
                oldManifest.pkg,
                "url-diff"
            )
            const rootRequestUrl = baseUrl
            const rootStorageUrl = CURRENT_APP_DIR
            const details = {
                delete: manifestDifferences.delete.map((f) => ({
                    ...f, 
                    requestUrl: rootRequestUrl + f.name, 
                    storageUrl: rootStorageUrl + f.name 
                })),
                add: manifestDifferences.add.map((f) => ({
                    ...f, 
                    requestUrl: rootRequestUrl + f.name, 
                    storageUrl: rootStorageUrl + f.name 
                })),
            }
            this.updates.partitions.push({
                appId: app.id,
                name: app.name,
                manifest: pkg,
                appDir: CURRENT_APP_DIR,
                totalBytes: totalAppSize,
                manifestBytes,
                baseUrl,
                details,
                addBytes: details.add
                    .reduce((t, {bytes}) => t + bytes, 0),
                deleteBytes: details.delete
                    .reduce((t, {bytes}) => t + bytes, 0),
            })
            return io.ok({})
        })
        const manifestResponses = await Promise.all(updatePromises)
        const ptrRecords = JSON.stringify(this.appPointers)
        const indexRecords = JSON.stringify(this.apps)
        await Promise.all([
            this.cacheFile(
                targetCache,
                ptrRecords,
                ENTRY_RECORDS_URL,
                "application/json",
                stringBytes(ptrRecords)
            ),
            this.cacheFile(
                targetCache,
                indexRecords,
                APP_INDEX_URL,
                "application/json",
                stringBytes(indexRecords)
            )
        ])
        this.updates = this.computeUpdateMeta(this.updates)
        this.updates.id = this.createUpdateId()
        return manifestResponses
    }

    private computeUpdateMeta(updates: AppUpdates) {
        updates.manifestsTotalBytes = updates
            .partitions
            .reduce((t, {manifestBytes}) => t + manifestBytes, 0)
        updates.totalBytes = updates
            .partitions
            .reduce((t, {totalBytes}) => t + totalBytes, 0)
        updates.id = ++this.updatesThisSession
        updates.bytesToAdd = updates
            .partitions
            .reduce((t, {addBytes}) => t + addBytes, 0)
        updates.bytesToDelete = updates
            .partitions
            .reduce((t, {deleteBytes}) => t + deleteBytes, 0)
        return updates
    }

    updatesAvailable() {
        return this.updates.partitions.length > 0
    }

    async execUpdates(params: UpdateOptions) {
        let appUpdates = this.updates
        let error = false
        // max retries is 3
        const MAX_UPDATE_RETRY = 3
        for (let i = 0; i < MAX_UPDATE_RETRY; i++) {
            const {data: updateStatus} = await this.updateCore({
                ...params,
                appUpdates: this.updates,
                attemptCount: i
            })
            if (updateStatus.failedRequests < 1) {
                error = false
                break
            }
            console.warn(log.name, `updates were not successfully finished, retrying again`)
            appUpdates = updateStatus
            error = true
        }
        const targetCache = await this.cache()
        if (!error) {
            await targetCache.delete(UPDATES_BACKUP_URL)
            return io.ok({})
        }
        const str = JSON.stringify(appUpdates)
        await this.cacheFile(
            targetCache,
            str,
            UPDATES_BACKUP_URL,
            "application/json",
            stringBytes(str)
        )
        return io.err(`Updates failed (retry=${MAX_UPDATE_RETRY}) try again later. You can find failure logs at ${UPDATES_BACKUP_URL}`)
    }

    private async updateCore({
        attemptCount,
        appUpdates,
        onProgress = () => {}
    }: (UpdateOptions & {
        appUpdates: AppUpdates
        attemptCount: number
    })) {
        const {partitions, manifestsTotalBytes, bytesToAdd} =  appUpdates
        const backup = deepCopy(appUpdates)
        const targetCache = await this.cache()
        let bytesCompleted = attemptCount < 1 
            ? manifestsTotalBytes
            : appUpdates.bytesCompleted
        const totalBytes = bytesToAdd
        for (let i = 0; i < partitions.length; i++) {
            const {details, appId, name} = partitions[i]
            this.downloadingPartition = appId
            await deleteCacheFiles(targetCache, details.delete)
            console.info(log.name, `deleted all stale files for app "${name}" (count=${details.delete.length})`)
            const {failedRequests, downloaded} = await persistAssetList({
                requestEngine: fetchRetry,
                cacheEngine: targetCache,
                files: details.add,
                logger: this.logger,
                concurrent: false,
                totalBytes,
                onProgress,
                name,
                attemptCount,
                bytesCompleted
            })
            bytesCompleted += downloaded
            backup.partitions[i].details.delete = []
            backup.partitions[i].details.add = failedRequests
        }
        appUpdates.bytesCompleted = bytesCompleted
        backup.failedRequests = backup.partitions.reduce((t, {details}) => {
            return t + details.add.length
        }, 0)
        backup.bytesCompleted = appUpdates.bytesCompleted
        backup.id = this.createUpdateId()
        return io.ok(backup)
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
            console.info(log.name, "{😼 show-launcher} mounting launcher")
            this.launcher.mount()
        } else {
            console.error(log.name, "{😼 show-launcher} launcher has not been defined yet")
        }
    }

    destroyLauncher() {
        if (this.launcher) {
            console.info(log.name, "{🙀 destroy-launcher} unmounting launcher")
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
        if (!entryPing.ok || !entryPing.data.ok) {
            const msg = `couldn't launch app "${appKey}" because entry does not exist in virtual drive (${VIRTUAL_DRIVE}).`
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
        mimeType: Mime,
        bytes: number
    ) {
        return targetCache.put(url, new Response(fileText, {
            status: 200,
            statusText: "OK",
            headers: headers(mimeType, bytes)
        }))
    }

    private async persistLauncherAssetList(
        urls: FileRef[],
        targetCache: Cache,
        failedRequestsUrl: string,
        isRetry: boolean
    ) {
        const {failedRequests} = await persistAssetList({
            files: urls,
            requestEngine: fetchRetry,
            cacheEngine: await this.cache(),
            logger: this.logger,
            concurrent: true,
            name: "launcher"
        })
        if (failedRequests.length < 1) {
            await targetCache.delete(failedRequestsUrl)
            return io.ok({})
        }
        const str = JSON.stringify(failedRequests)
        await this.cacheFile(
            targetCache,
            str,
            failedRequestsUrl,
            "application/json",
            stringBytes(str)
        )
        return io.ok({})
    }

    async cacheLaucherAssets() {
        const rootDoc = window.location.origin + "/"
        const targetCache = await this.cache()
        await this.cacheFile(
            targetCache,
            this.rootHtmlDoc,
            rootDoc,
            "text/html",
            stringBytes(this.rootHtmlDoc),
        )
        console.info(log.name, `cached root html document at ${rootDoc}`)
        this.rootHtmlDoc = ""
        const previousManifestRes = await targetCache.match(LAUNCHER_CARGO)
        const cargoRes = await fetchManifestFromUrl(
            "launcher", rootDoc
        )
        if (!cargoRes.ok) {
            console.warn(log.name, `couldn't get launcher manifest, reason: ${cargoRes.msg}`)
            return cargoRes
        }
        const {pkg, errors} = cargoRes.data.manifest
        if (errors.length > 0) {
            const msg = `${log.name} launcher manifest is incorrectly encoded, errors: ${errors.join()}`
            console.warn(msg)
            return io.err(msg)
        }
        pkg.files = pkg.files
            .filter(({name}) => {
                return (
                    name.length > 0 
                    && name !== "/" 
                    && name !== rootDoc
                    && name !== "index.html"
                    && name !== "/index.html"
                )
            })
        const pkgStr = JSON.stringify(pkg)
        await this.cacheFile(
            targetCache,
            pkgStr,
            LAUNCHER_CARGO,
            "application/json",
            stringBytes(pkgStr)
        )
        const retryLaterUrl = rootDoc + LAUNCHER_PARTIAL_UPDATES
        if (!previousManifestRes) {
            console.info(log.name, "launcher has not been installed yet. Installing now...")
            await this.persistLauncherAssetList(
                pkg.files.map(({name, bytes}) => ({
                    name,
                    bytes,
                    requestUrl: rootDoc + name,
                    storageUrl: rootDoc + name,
                })),
                targetCache,
                retryLaterUrl,
                false
            )
            console.info(log.name, "cache files root files successfully")
            return io.ok({})
        }
        const updateRes = cargoIsUpdatable(
            pkg, await previousManifestRes.json() 
        )
        
        let failedAssetsRes: Response | null | undefined = null
        if (!updateRes.updateAvailable) {
            console.info(log.name, `laucher is up to date (v=${pkg.version})`)
            return io.ok({})
        } else if (
            !updateRes.updateAvailable
            && (failedAssetsRes = await targetCache.match(retryLaterUrl))
        ) {
            const assets = failedAssetsRes
            if (!assets.ok) {
                return io.ok({})
            }
            return await this.persistLauncherAssetList(
                await assets.json() as FileRef[],
                targetCache,
                retryLaterUrl,
                true
            )
        }
        const {newManifest, oldManifest} = updateRes
        const diff = diffManifestFiles(
            newManifest.pkg, oldManifest.pkg, "url-diff"
        )
        
        const cacheRes = await this.persistLauncherAssetList(
            diff.add.map(({name, bytes}) => ({
                name,
                bytes,
                requestUrl: rootDoc + name,
                storageUrl: rootDoc + name,
            })),
            targetCache,
            retryLaterUrl,
            false
        )
        await Promise.all(diff.delete.map((f) => {
            return targetCache.delete(rootDoc + f.name)
        }))
        console.info(`${log.name} removed stale launcher files`)
        return cacheRes
    }
}