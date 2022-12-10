import {AppEntryPointers} from "./types"
import {
    entryRecords,
    appFolder,
    launcherCargo
} from "./utils"
import {
    validateManifest,
    dummyManifest,
    ValidatedCodeManfiest,
    CodeManifestSafe,
    NULL_MANIFEST_VERSION
} from "../cargo/index"
import {SemVer} from "../nanoSemver/index"
import {
    MANIFEST_NAME,
    InvalidationStrategy
} from "../cargo/consts"
import {APP_INDEX, VIRTUAL_DRIVE} from "./consts"
import {io, Result} from "../monads/result"

const ENTRY_RECORDS_URL = entryRecords(window.location.origin)
const LAUNCHER_CARGO = launcherCargo(window.location.origin)
const APP_INDEX_URL = window.location.origin + "/" + APP_INDEX

const appManifestUrl = (appId: number) => appFolder(window.location.origin, appId) + MANIFEST_NAME

const enum log {
    name = "[👻 shabah]:"
}

const enum bytes {
    per_mb = 1_000_000
}

const fetchRetry = (
    input: RequestInfo | URL, 
    init: RequestInit & {retryCount: number}
) => {
    return io.retry(
        () => fetch(input, init), 
        init.retryCount
    )
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

const tokenizeAppList = (apps: AppList) => Object.keys(apps).map(k => ({name: k, ...apps[k]}))
type AppListTokens = ReturnType<typeof tokenizeAppList>

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

const standardizedUrl = (url: string, baseUrl: string) => {
    if (url.startsWith("/")) {
        return baseUrl + url
    } else if (url.startsWith("./")) {
        return baseUrl + url.slice(1)
    } else {
        return baseUrl + "/" + url
    }
}

const stripRelativePath = (url: string) => {
    if (url.startsWith("/")) {
        return url.slice(1)
    } else if (url.startsWith("./")) {
        return url.slice(2)
    } else {
        return url
    }
}

const invalidationType = <T extends InvalidationStrategy>(
    type: InvalidationStrategy,
    fallBack: T 
) => {
    return (type === "default" 
        ? "url-diff"
        : fallBack) as InvalidationStrategy
}

const DEFAULT_INVALIDATION: InvalidationStrategy = "url-diff"

const diffManifests = async (
    oldManifest: CodeManifestSafe | null,
    newManifest: ValidatedCodeManfiest,
    packageBaseUrl: string,
    packageId: number
) => {
    const out = {delete: [], add: []} as UpdateDetails
    const newFiles: Record<string, InvalidationStrategy> = {}
    const newPkg = newManifest.pkg
    for (let i = 0; i < newPkg.files.length; i++) {
        const file = newPkg.files[i]
        if (file.name.startsWith("https://")) {
            // ignore if cross origin
            continue
        }
        const strategy = invalidationType(file.invalidation, DEFAULT_INVALIDATION) 
        newFiles[standardizedUrl(file.name, packageBaseUrl)] = strategy
    }
    const oldFiles: Record<string, {bytes: number}> = {}
    const oldManifestFiles = oldManifest 
        ? oldManifest.files 
        : []
    for (let i = 0; i < oldManifestFiles.length; i++) {
        const {name, bytes} = oldManifestFiles[i]
        oldFiles[standardizedUrl(name, packageBaseUrl)] = {bytes}
    }
    const packageDir = appFolder(
        window.location.origin, packageId
    )
    for (let i = 0; i < newPkg.files.length; i++) {
        const {name, bytes} = newPkg.files[i]
        const stdName = standardizedUrl(name, packageBaseUrl)
        if (!oldFiles[stdName] || newFiles[stdName] === "purge") {
            out.add.push({
                name, 
                bytes, 
                requestUrl: stdName,
                storageUrl: (
                    packageDir 
                    + stripRelativePath(name)
                )
            })
        }
    }

    const oldFileKeys = Object.keys(oldFiles)
    for (let i = 0; i < oldFileKeys.length; i++) {
        const name = oldFileKeys[i]
        const stdName = standardizedUrl(name, packageBaseUrl)
        const fileInvalidation = newFiles[stdName]
        if (!fileInvalidation || fileInvalidation === "purge") {
            const info = oldFiles[stdName] || {}
            const {bytes = 0} = info
            out.delete.push({
                name, 
                bytes, 
                requestUrl: stdName,
                storageUrl: (
                    packageDir 
                    + stripRelativePath(name)
                )
            })
        }
    }
    return out
}

const NULL_PACKAGE_VERSION = NULL_MANIFEST_VERSION

export class Shabah<Apps extends AppList> {
    readonly apps: Apps
    private tokenizedApps: AppListTokens
    requestEngine: "native-fetch"
    readonly mode: ShabahModes
    readonly appPointers: AppEntryPointers
    private updates: {
        id: number,
        totalBytes: number,
        bytesToAdd: number,
        bytesToDelete: number,
        manifestsTotalBytes: number,
        partitions: {
            appId: number,
            name: string,
            manifest: CodeManifestSafe
            baseUrl: string,
            appDir: string
            totalBytes: number
            manifestBytes: number
            details: UpdateDetails
            addBytes: number
            deleteBytes: number
        }[]
    }
    private updatesThisSession: number
    downloadingPartition: number
    private launcher: AppLauncher | null
    readonly cacheName: string

    constructor({
        apps, 
        mode, 
        cacheName, 
        previousCaches = []
    }: Readonly<{
        apps: Apps,
        mode: ShabahModes,
        cacheName: string,
        previousCaches?: string[]
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
        this.tokenizedApps = tokenizeAppList(self.apps)
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
            bytesToDelete: 0,
            bytesToAdd: 0,
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
    }

    private cache() {
        return caches.open(this.cacheName) 
    }

    async checkForUpdates() {
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
            console.error(log.name, `previous app list found but couldn't parse correctly, json encoded incorrectly?`)
            return
        }
        const apps = this.tokenizedApps
        const previousApps = previousAppsJson.data as AppListTokens
        const currentAppIds: Record<number, boolean> = {}
        const appsToUpdate: (AppListTokens[number] & {
            cargoSrc: {
                manifest: null | ValidatedCodeManfiest,
                size: number
            },
            previousCargo: CodeManifestSafe | null,
        })[] = []
        const newManifestPackage = dummyManifest().pkg
        // set version to zero
        newManifestPackage.version = NULL_PACKAGE_VERSION
        await Promise.all(apps.map(async (app) => {
            currentAppIds[app.id] = true
            const manifestUrl = appManifestUrl(app.id)
            const prevCargoFile = await targetCache.match(manifestUrl)
            if (!prevCargoFile) {
                console.info(log.name, `previous cargo not found for app ${app.name}`)
            }
            const prevParsed = !prevCargoFile
                ? null
                : await prevCargoFile.json() as CodeManifestSafe
            const previousCargo = !prevParsed
                ? newManifestPackage
                : prevParsed
            appsToUpdate.push({
                ...app, 
                cargoSrc: {manifest: null, size: 0},
                previousCargo
            })
        }))

        for (const prevApp of previousApps) {
            if (currentAppIds[prevApp.id]) {
                continue
            }
            const deletionManifest = dummyManifest()
            // give it an astronomical version level
            // so that isGreater always returns true
            deletionManifest.pkg.version = "100000000.0.0"
            // give it no files so it deletes
            // all files associated with it
            deletionManifest.pkg.files = []
            appsToUpdate.push({
                ...prevApp, 
                cargoSrc: {
                    manifest: deletionManifest,
                    size: 0
                },
                previousCargo: null
            })
        }
        

        const failedManifestRequests: number[] = []
        const updatePromises = appsToUpdate.map(async (app, i) => {
            const pkgRes = app.cargoSrc.manifest
                ? io.ok(app.cargoSrc)
                : await fetchManifestFromUrl(app.name, app.appRootUrl)
            if (!pkgRes.ok || !pkgRes.data.manifest) {
                failedManifestRequests.push(i)
                return 
            }
            const {manifest, size} = pkgRes.data
            const {pkg, errors, semanticVersion: currentSemVer} = manifest 
            const baseUrl = app.appRootUrl.endsWith("/")
                ? app.appRootUrl
                : app.appRootUrl + "/"
            const manifestUrl = baseUrl + MANIFEST_NAME
            if (errors.length > 0) {
                console.error(log.name, `manifest for "${app.name}" (${manifestUrl}) is not a valid ${MANIFEST_NAME} format. Errors: ${errors.join()}`)
                return
            }
            const prevVersion = app.previousCargo?.version || NULL_PACKAGE_VERSION
            const prevSemVer = SemVer.fromString(prevVersion)
            if (
                prevVersion !== NULL_PACKAGE_VERSION
                && prevSemVer
                && !prevSemVer.isLower(currentSemVer)
            ) {
                console.info(log.name, `app "${app.name}" is update to date (${pkg.version})`)
                return
            }
            const manifestBytes = size
            const totalAppSize = pkg.files.reduce((total, {bytes}) => {
                return total + bytes
            }, manifestBytes)
            console.info(log.name, `successfully fetched "${app.name}" manifest, app_size is ${Math.max(roundDecimal(totalAppSize / bytes.per_mb, 2), 0.01)}mb`)
            const CURRENT_APP_DIR = appFolder(
                window.location.origin, app.id
            )
            const appEntryUrl = (
                CURRENT_APP_DIR 
                + stripRelativePath(pkg.entry)
            )
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
            const details = await diffManifests(
                app.previousCargo, manifest,
                baseUrl,
                app.id
            )
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
        })
        await Promise.all(updatePromises)
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
        this.updates.manifestsTotalBytes = this.updates
            .partitions
            .reduce((t, {manifestBytes}) => t + manifestBytes, 0)
        this.updates.totalBytes = this.updates
            .partitions
            .reduce((t, {totalBytes}) => t + totalBytes, 0)
        this.updates.id = ++this.updatesThisSession
        this.updates.bytesToAdd = this.updates
            .partitions
            .reduce((t, {addBytes}) => t + addBytes, 0)
        this.updates.bytesToDelete = this.updates
            .partitions
            .reduce((t, {deleteBytes}) => t + deleteBytes, 0)
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
        const totalBytes = this.updates.bytesToAdd
        for (let i = 0; i < updates.length; i++) {
            const u = updates[i]
            const failedRequests = []
            this.downloadingPartition = u.appId
            const deleteFiles = u.details.delete
            await Promise.all(deleteFiles.map(({storageUrl}) => {
                return targetCache.delete(storageUrl)
            }))
            console.info(log.name, `deleted all stale files for app "${u.name}" (count=${deleteFiles.length})`)
            const addFiles = u.details.add
            for (let f = 0; f < addFiles.length; f++) {
                const file = addFiles[f]
                const {name, bytes, requestUrl, storageUrl} = file
                const fileRes = await fetchRetry(requestUrl, {
                    method: "GET",
                    retryCount: 3
                })
                if (!fileRes.ok || !fileRes.data.ok) {
                    failedRequests.push({...file})
                    continue
                }
                onProgress({
                    downloaded,
                    total:  totalBytes,
                    latestFile: stripRelativePath(name),
                    latestPartition: u.name 
                })
                downloaded += bytes
                await this.cacheFile(
                    targetCache,
                    await fileRes.data.text(),
                    storageUrl,
                    fileRes.data.headers.get("content-type") || "text/plain",
                    bytes
                )
                console.info(log.name, `inserted file ${name} (${u.name}) into virtual drive (${storageUrl})`)
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
        if (!entryPing.data || !entryPing.data.ok) {
            const msg = `couldn't launch app "${appKey}" because entry does not exist in virtual drive (${VIRTUAL_DRIVE.slice(1) + "/"}).`
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
        cargoUrl = "cargo.json",
        useMiniCargoDiff = false,
        miniCargoUrl = ""
    } = {}) {
        const targetCache = await this.cache()
        const htmlDoc = rootHtmlDoc.length > 0
            ? rootHtmlDoc
            : "<!DOCTYPE html>\n" + document.documentElement.outerHTML
        const htmlBytes = stringBytes(htmlDoc)
        const rootDoc = window.location.origin + "/"
        await this.cacheFile(
            targetCache,
            htmlDoc,
            rootDoc,
            "text/html",
            htmlBytes,
        )
        console.info(log.name, `cached root html document at ${rootDoc}`)
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
        const {pkg, errors, semanticVersion} = validateManifest(
            await manifestRes.data.json(),
        )
        if (errors.length > 0) {
            console.error(log.name, "launcher manifest is incorrectly encoded, errors:", errors.join())
            return
        }
        const previousManifestRes = await targetCache.match(LAUNCHER_CARGO)
        if (!previousManifestRes) {
            console.log(log.name, "launcher has not been installed yet. Installing now...")
            const installFiles = pkg.files
                .map(({name}) => name)
                .filter((n) => {
                    return (
                        n !== "/"
                        && n !== "/index.html"
                        && n !== rootDoc
                    )
                })
            await targetCache.addAll(installFiles)
            console.log(log.name, "cache files successfully, list", installFiles.join())
            return
        }
    }
}