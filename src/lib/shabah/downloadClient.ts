import {
    checkForUpdates,
    createResourceMap,
} from "./client"
import {io} from "../monads/result"
import {
    CargoIndexWithoutMeta,
    CargoIndices,
    saveCargoIndices,
    getCargoIndices,
    updateCargoIndex,
    DownloadIndexCollection,
    saveDownloadIndices,
    headers,
    FetchFunction,
    getDownloadIndices,
    updateDownloadIndex,
    FileCache,
    stringBytes,
    DownloadManager,
    serviceWorkerPolicies,
    DownloadState,
    getErrorDownloadIndex,
    rootDocumentFallBackUrl,
} from "./backend"
import {BYTES_PER_MB} from "../utils/consts/storage"
import {readableByteCount} from "../utils/storage/friendlyBytes"
import {MANIFEST_NAME} from "../cargo/index"
import {Cargo} from "../cargo/index"
import {resultJsonParse} from "../monads/utils/jsonParse"
import {
    cleanPermissions, 
    hasUnsafePermissions, 
    generatePermissionsSummary,
    CleanedPermissions
} from "../utils/security/permissionsSummary"
import { Permissions } from "../types/permissions"

export type {CargoIndex, CargoIndices} from "./backend"

const SYSTEM_RESERVED_BYTES = 200 * BYTES_PER_MB

type UpdateDetails = Awaited<ReturnType<Shabah["checkForCargoUpdates"]>>

type ProgressIndicator = DownloadState & {
    installing: boolean
    ready: boolean
}

type onProgressCallback = (progress: ProgressIndicator) => any

const INVALID_LISTENER_ID = -1

const defaultDownloadState = (id: string) => ({
    id,
    downloaded: 0,
    total: 0,
    failed: false,
    finished: false,
    failureReason: "",
    installing: false,
    ready: false
} as const)

type ShabahProps = {
    origin: string,
    adaptors: {
        fileCache: FileCache
        networkRequest: FetchFunction
        downloadManager: DownloadManager
    }
}

export class Shabah {
    static readonly NO_PREVIOUS_INSTALLATION = "none"
    static readonly POLICIES = {...serviceWorkerPolicies} as const

    static readonly STATUS = {
        updateError: 0,
        updateNotEnoughDiskSpace: 1,
        updateNotAvailable: 2,
        updateQueued: 3,
        sameUpdateInProgress: 4,
        updateAlreadyQueue: 5,
        cargoNotFound: 6,
        cargoNotInErrorState: 7,
        errorIndexNotFound: 8,
        cacheIsFresh: 9,
        cached: 10,
        deleted: 11,
        archived: 12
    } as const

    networkRequest: FetchFunction
    fileCache: FileCache
    downloadManager: DownloadManager
    readonly origin: string

    private cargoIndicesCache: null | CargoIndices
    private downloadIndicesCache: null | DownloadIndexCollection
    private progressListeners: Array<{
        id: string
        callback: onProgressCallback
    }>
    private progressListenerTimeoutId: string | number | NodeJS.Timeout

    constructor({adaptors, origin}: ShabahProps) {
        const {
            networkRequest, 
            fileCache, 
            downloadManager
        } = adaptors
        this.networkRequest = networkRequest
        this.fileCache = fileCache
        this.downloadManager = downloadManager
        this.origin = origin.endsWith("/")
            ? origin.slice(0, -1)
            : origin
        this.cargoIndicesCache = null
        this.downloadIndicesCache = null
        this.progressListeners = []
        this.progressListenerTimeoutId = INVALID_LISTENER_ID
    }

    async diskInfo() {
        const [diskusage, downloadIndices] = await Promise.all([
            this.fileCache.queryUsage(),
            this.getDownloadIndices()
        ] as const)
        const used = diskusage.usage + downloadIndices.totalBytes
        const total = Math.max(
            diskusage.quota - SYSTEM_RESERVED_BYTES,
            0
        )
        const left = total - used
        return {used, total, left}
    }

    async checkForCargoUpdates(cargo: {
        storageUrl: string
        canonicalUrl: string
        id: string
    }) {
        const {networkRequest, fileCache} = this
        const cargoIndex = await this.getCargoMetaByCanonicalUrl(
            cargo.canonicalUrl
        )
        const response = await checkForUpdates({
            canonicalUrl: cargo.canonicalUrl,
            oldResolvedUrl: !cargoIndex ? "" : cargoIndex.resolvedUrl,
            name: cargo.id
        }, networkRequest, fileCache)
        if (response.newCargo) {
            const permissions = response.newCargo.parsed.permissions
            response.newCargo.parsed.permissions = cleanPermissions(permissions)
        }
        const disk = await this.diskInfo()
        const diskWithCargo = (
            disk.used + response.bytesToDownload
        )
        const enoughSpaceForPackage = disk.total < 1
            ? false
            : diskWithCargo < disk.total
        const bytesNeededToDownload = Math.max(
            0, (diskWithCargo - disk.total)
        )
        const previousVersion = (
            response.previousCargo?.version 
            || Shabah.NO_PREVIOUS_INSTALLATION
        )
        const newVersion = (
             response.newCargo?.parsed.version
            || Shabah.NO_PREVIOUS_INSTALLATION
        )

       
        let newPermissionsRequested = [] as CleanedPermissions
        if (response.newCargo && response.previousCargo) {
            const oldPermissions = cleanPermissions(response.previousCargo.permissions)
            const oldPermissionsMap = new Map<string, number>()
            for (let i = 0; i < oldPermissions.length; i++) {
                const {key, value} = oldPermissions[i]
                oldPermissionsMap.set(key, 1)
                for (let x = 0; x < value.length; x++) {
                    const current = value[x]
                    oldPermissionsMap.set(`${key}:${current}`, 1)
                }
            }
            const newPermissions = response.newCargo.parsed.permissions as CleanedPermissions
            for (let i = 0; i < newPermissions.length; i++) {
                const permission = newPermissions[i]
                const {key, value} = newPermissions[i]
                if (!oldPermissionsMap.has(key)) {
                    newPermissionsRequested.push(permission)
                    continue
                }
                const newValues = []
                let newCount = 0
                for (let x = 0; x < value.length; x++) {
                    const current = value[x]
                    if (oldPermissionsMap.has(`${key}:${current}`)) {
                        continue
                    }
                    newCount += 1
                    newValues.push(current)
                }
                if (newCount > 0) {
                    newPermissionsRequested.push(
                        {key, value: newValues} as typeof permission
                    )
                }
            }
        } else if (response.newCargo) {
            newPermissionsRequested = response.newCargo.parsed.permissions as CleanedPermissions
        }

        const friendlyBytes = readableByteCount(bytesNeededToDownload)
        return {
            updateCheckResponse: response,
            versions: {new: newVersion, old: previousVersion},
            errorOccurred: response.errors.length > 0,
            enoughSpaceForPackage,
            updateAvailable: !!response.newCargo,
            newPermissionsRequested,
            unsafeCargo: response.newCargo 
                ? hasUnsafePermissions(
                    generatePermissionsSummary(
                        (response.newCargo.parsed as Cargo<Permissions>).permissions
                    )
                )
                : false,
            diskInfo: {
                ...disk,
                usageAfterDownload: diskWithCargo,
                bytesNeededToDownload,
                bytesNeededToDownloadFriendly: `${friendlyBytes.count} ${friendlyBytes.metric.toUpperCase()}`,
            },
            ...cargo,
        }  
    }

    private async refreshDownloadIndicies() {
        const {origin, fileCache} = this
        const indices = await getDownloadIndices(origin, fileCache)
        this.downloadIndicesCache = indices
        return indices
    }

    private async getDownloadIndices() {
        if (this.downloadIndicesCache) {
            return this.downloadIndicesCache
        }
        return this.refreshDownloadIndicies()
    }

    private async persistDownloadIndices(indices: DownloadIndexCollection) {
        const {origin, fileCache} = this
        return await saveDownloadIndices(indices, origin, fileCache)
    }

    async getDownloadState(updateId: string) {
        const downloadsIndex = await this.getDownloadIndices()
        const updateIndex = downloadsIndex.downloads.findIndex((index) => {
            return index.id === updateId
        })
        if (updateIndex < 0) {
            return null
        }
        const targetUpdate =  downloadsIndex.downloads[updateIndex]
        return {...targetUpdate}
    }

    private async refreshCargoIndices() {
        const {origin, fileCache} = this
        const cargos = await getCargoIndices(origin, fileCache)
        this.cargoIndicesCache = cargos
        return cargos
    }

    async getCargoIndices() {
        if (this.cargoIndicesCache) {
            return this.cargoIndicesCache
        }
        return this.refreshCargoIndices()
    }

    private async persistCargoIndices(indices: CargoIndices) {
        const {origin, fileCache} = this
        return await saveCargoIndices(indices, origin, fileCache)

    }

    private async putCargoIndex(
        newIndex: CargoIndexWithoutMeta,
        {persistChanges}: {persistChanges: boolean}
    ) {
        const indices = await this.getCargoIndices()
        updateCargoIndex(indices, newIndex)
        if (persistChanges) {
            await this.persistCargoIndices(indices)
        }
    }

    async executeUpdates(
        details: UpdateDetails,
        updateTitle: string,
    ) {
        if (
            !details.updateAvailable 
            || !details.updateCheckResponse.newCargo
        ) {
            return io.ok(
                Shabah.STATUS.updateNotAvailable,
                //"update not available"
            )
        } else if (!details.enoughSpaceForPackage) {
            return io.ok(
                Shabah.STATUS.updateNotEnoughDiskSpace,
                //"not enough disk space for update"
            )
        } else if (details.errorOccurred) {
            return io.ok(
                Shabah.STATUS.updateError,
                //"error occurred when searching for update"
            )
        }
        const downloadsIndex = await this.getDownloadIndices()
        const prevUpdateIndex = downloadsIndex.downloads.findIndex((index) => {
            return index.id === details.id
        })
        const updateInProgress = prevUpdateIndex > -1
        if (updateInProgress) {
            return io.ok(
                Shabah.STATUS.sameUpdateInProgress,
                //"update is already in progress",

            )
        }
        const updateBytes = details.updateCheckResponse.bytesToDownload
        const updateIndex = {
            id: details.id,
            bytes: updateBytes,
            map: createResourceMap(
                details.updateCheckResponse.downloadableResources
            ),
            version: details.versions.new,
            previousVersion: details.versions.old,
            title: updateTitle,
            resolvedUrl: details.storageUrl
        }
        const {fileCache, downloadManager} = this
        updateDownloadIndex(downloadsIndex, updateIndex)
        const newCargo = details.updateCheckResponse.newCargo
        await Promise.all([
            this.persistDownloadIndices(downloadsIndex),
            fileCache.putFile(
                newCargo.resolvedUrl + MANIFEST_NAME, 
                new Response(JSON.stringify(newCargo.parsed), {
                    status: 200,
                    statusText: "OK",
                    headers: headers(
                        "application/json",
                        stringBytes(newCargo.text)
                    )
                })
            ),
            this.putCargoIndex(
                {
                    name: newCargo.parsed.name,
                    id: details.id,
                    state: "updating",
                    permissions: newCargo.parsed.permissions,
                    version: details.versions.new,
                    entry: newCargo.parsed.entry,
                    bytes: details.updateCheckResponse.totalBytes,
                    resolvedUrl: newCargo.resolvedUrl,
                    canonicalUrl: newCargo.canonicalUrl,
                    logoUrl: newCargo.parsed.crateLogoUrl
                },
                {persistChanges: true}
            ),
        ] as const)
        const expiredUrls = details.updateCheckResponse.resoucesToDelete
        await Promise.all(
            expiredUrls.map(({storageUrl}) => fileCache.deleteFile(storageUrl))
        )
        const requestUrls = details.updateCheckResponse.downloadableResources
        await downloadManager.queueDownload(
            details.id,
            requestUrls.map((f) => f.requestUrl),
            {title: updateTitle, downloadTotal: updateBytes}
        )
        return io.ok(
            Shabah.STATUS.updateQueued,
            //"update queued", 
        )
    }

    async getCargoMeta(cargoId: string) {
        const indices = await this.getCargoIndices()
        const index = indices.cargos.findIndex((cargo) => cargo.id === cargoId)
        if (index < 0) {
            return null
        }
        return indices.cargos[index]
    }

    async getCargoMetaByEntry(entryUrl: string) {
        const indices = await this.getCargoIndices()
        const index = indices.cargos.findIndex((cargo) => cargo.entry === entryUrl)
        if (index < 0) {
            return null
        }
        return indices.cargos[index]
    }

    async getCargoMetaByCanonicalUrl(canonicalUrl: string) {
        const indices = await this.getCargoIndices()
        const index = indices.cargos.findIndex((cargo) => cargo.canonicalUrl === canonicalUrl)
        if (index < 0) {
            return null
        }
        return indices.cargos[index]
    }

    addProgressListener(
        id: string, 
        callback: onProgressCallback
    ) {
        const listenerIndex = this.progressListeners
            .findIndex((listener) => listener.id === id)
        const alreadyRegistered = listenerIndex > -1
        if (alreadyRegistered) {
            const target = this.progressListeners[listenerIndex]
            target.callback = callback
            return
        }
        this.progressListeners.push({id, callback})
        const alreadySet = this.progressListenerTimeoutId !== INVALID_LISTENER_ID
        if (alreadySet) {
            return
        }
        const self = this
        const globalListener = async () => {
            const listeners = self.progressListeners
            await Promise.all([
                self.refreshCargoIndices(),
                self.refreshDownloadIndicies()
            ])
            const KEEP_ON_QUEUE = -1
            const indexesToRemove = await Promise.all(listeners.map(async (listener, index) => {
                const {id, callback} = listener
                const managerState = await self
                    .downloadManager
                    .getDownloadState(id)
                const downloading = !!managerState
                if (downloading) {
                    callback({
                        ...defaultDownloadState(id), 
                        ...managerState
                    })
                    return KEEP_ON_QUEUE
                }
                const [downloadIndex, meta] = await Promise.all([
                    self.getDownloadState(id),
                    self.getCargoMeta(id)
                ] as const)
                const failed = (
                    meta?.state === "update-aborted"
                    || meta?.state === "update-failed"
                )
                if (failed) {
                    callback({
                        ...defaultDownloadState(id),
                        failed: true,
                        failureReason: meta.state
                    })
                    return index
                }
                const installing = !!downloadIndex
                if (installing) {
                    callback({
                        ...defaultDownloadState(id), 
                        installing: true, 
                        finished: true
                    })
                    return KEEP_ON_QUEUE
                }

                callback({
                    ...defaultDownloadState(id), 
                    finished: true, 
                    ready: true
                })
                return index
            }))
            const validIndexes = indexesToRemove.filter((index) => index !== KEEP_ON_QUEUE)
            
            for (const index of validIndexes) {
                listeners.splice(index, 1)
            }

            if (listeners.length < 1) {
                clearInterval(self.progressListenerTimeoutId)
                self.progressListenerTimeoutId = INVALID_LISTENER_ID
            }
        }
        const pollingMilliseconds = 2_000
        const listenerId = setInterval(
            globalListener, pollingMilliseconds
        )
        this.progressListenerTimeoutId = listenerId
    }

    removeProgressListener(id: string) {
        const listeners = this.progressListeners
        const listenerIndex = listeners
            .findIndex((listener) => listener.id === id)
        const notFound = listenerIndex < 0
        if (notFound) {
            return
        }
        listeners.splice(listenerIndex, 1)
        if (listeners.length < 1) {
            clearInterval(this.progressListenerTimeoutId)
            this.progressListenerTimeoutId = INVALID_LISTENER_ID
        }
    }

    async retryFailedDownload(id: string) {
        const cargoMeta = await this.getCargoMeta(id)
        if (!cargoMeta) {
            return io.ok(
                Shabah.STATUS.cargoNotFound,
                //"id doesn't exist"
            )
        }
        const {state} = cargoMeta
        if (state === "archived") {
            return io.ok(
                Shabah.STATUS.cargoNotInErrorState,
                //"cargo has been deleted"
            )
        }
        if (state !== "update-aborted" && state !== "update-failed") {
            return io.ok(
                Shabah.STATUS.cargoNotInErrorState,
                //"last cargo update did not fail"
            )
        }
        const {resolvedUrl} = cargoMeta
        const errDownloadIndexRes = await getErrorDownloadIndex(
            resolvedUrl, this.fileCache
        )
        if (!errDownloadIndexRes) {
            return io.ok(
                Shabah.STATUS.errorIndexNotFound,
                //"error index not found"

            )
        }
        const downloadsIndex = await this.getDownloadIndices()
        const prevUpdateIndex = downloadsIndex
            .downloads
            .findIndex((index) => index.id === id)
        const updateInProgress = prevUpdateIndex > -1
        if (updateInProgress) {
            return io.ok(
                Shabah.STATUS.sameUpdateInProgress,
                //"update is already in progress"
            )
        }
        const {index: errDownloadIndex, url} = errDownloadIndexRes
        updateDownloadIndex(downloadsIndex, errDownloadIndex)
        await Promise.all([
            this.persistDownloadIndices(downloadsIndex),
            this.putCargoIndex(
                {...cargoMeta, state: "updating"},
                {persistChanges: true}
            )
        ])
        const {title, bytes} = errDownloadIndex
        await this.downloadManager.queueDownload(
            id,
            Object.keys(errDownloadIndex.map),
            {title, downloadTotal: bytes}
        )
        return io.ok(
            Shabah.STATUS.updateQueued,
            //"update queued"
        )
    }

    async cacheRootDocumentFallback() {
        const {networkRequest, origin, fileCache} = this
        const rootUrl = origin + "/"
        const fallbackUrl = rootDocumentFallBackUrl(origin)
        const rootDocRequest = await io.retry(
            () => networkRequest(rootUrl, {
                method: "GET",
                headers: Shabah.POLICIES.networkFirst
            }),
            3
        )
        if (!rootDocRequest.ok || !rootDocRequest.data.ok) {
            return io.err("root document request failed")
        }
        const mimeType = rootDocRequest.data.headers.get("content-type")
        if (mimeType !== "text/html") {
            return io.err(
                `root document caching failed, expected mime "text/html", ${mimeType ? `got ${mimeType}` : "couldn't find header 'Content-Type'"}`
            )
        }
        await fileCache.putFile(fallbackUrl, rootDocRequest.data)
        return io.ok(
            Shabah.STATUS.cached, 
            //"cached root document"
        )
    }

    uninstallAllAssets() {
        return this.fileCache.deleteAllFiles()
    }

    async getCargoAtUrl(resolvedUrl: string) {
        const cleanedRootUrl = resolvedUrl.endsWith("/")
            ? resolvedUrl
            : resolvedUrl + "/"
        const cargoUrl = `${cleanedRootUrl}${MANIFEST_NAME}`
        const cargoFile = await this.fileCache.getFile(cargoUrl)
        if (!cargoFile) {
            return io.err("not found")
        }
        const cargoFileText = await io.wrap(cargoFile.text())
        if (!cargoFileText.ok) {
            return io.err("no text found in cargo response")
        }
        const cargoFileJson = resultJsonParse(cargoFileText.data)
        if (!cargoFileJson.ok) {
            return io.err("cargo not json encoded")
        }
        return io.ok({
            name: MANIFEST_NAME,
            pkg: cargoFileJson.data as Cargo,
            bytes: stringBytes(cargoFileText.data)
        })
    }

    getCachedFile(url: string) {
        return this.fileCache.getFile(url)
    }

    private async deleteAllCargoFiles(resolvedUrl: string) {
        const fullCargo = await this.getCargoAtUrl(
            resolvedUrl
        )
        if (!fullCargo.ok) {
            return io.err(`cargo does not exist in hard drive`)
        }
        const {pkg} = fullCargo.data
        pkg.files.push({
            name: MANIFEST_NAME, 
            bytes: 0, 
            invalidation: "default"
        })
        const fileCache = this.fileCache
        const deleteResponses = await Promise.all(pkg.files.map((file) => {
            const url = `${resolvedUrl}${file.name}`
            return fileCache.deleteFile(url)
        }))
        return deleteResponses.reduce(
            (total, next) => total && next, true
        )
    }

    async deleteCargo(id: string) {
        const cargoIndex = await this.getCargoIndices()
        const index = cargoIndex.cargos.findIndex((cargo) => cargo.id === id)
        if (index < 0) {
            return io.err(`package with id "${id}" does not exist`)
        }
        const targetCargo = cargoIndex.cargos[index]
        await this.deleteAllCargoFiles(
            targetCargo.resolvedUrl
        )
        cargoIndex.cargos.splice(index, 1)
        await this.persistCargoIndices(cargoIndex)
        return io.ok(Shabah.STATUS.deleted)
    }

    async archiveCargo(id: string) {
        const cargoIndex = await this.getCargoIndices()
        const index = cargoIndex.cargos.findIndex((cargo) => cargo.id === id)
        if (index < 0) {
            return io.err(`package with id "${id}" does not exist`)
        }
        const targetCargo = cargoIndex.cargos[index]
        await this.deleteAllCargoFiles(
            targetCargo.resolvedUrl
        )
        cargoIndex.cargos.splice(index, 1, {
            ...targetCargo,
            state: "archived"
        })
        await this.persistCargoIndices(cargoIndex)
        return io.ok(Shabah.STATUS.archived)
    }
}