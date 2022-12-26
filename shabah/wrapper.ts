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
} from "./shared"

export const enum bytes {
    bytes_per_kb = 1_024,
    bytes_per_mb = 1_000 * bytes_per_kb,
    bytes_per_gb = 1_000 * bytes_per_mb
}

const SYSTEM_RESERVED_BYTES = 200 * bytes.bytes_per_mb

const DISK_CLEAR_MULTIPLIER = 3

type ShabahOptions = {
    origin: string,
    fileCache: FileCache
    fetchFile: FetchFunction
    downloadManager: DownloadManager
}

export const roundDecimal = (num: number, decimals: number) => {
    const factor = 10 ** decimals
    return Math.round(num * factor) / factor
}

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

export class Shabah {
    static readonly NO_PREVIOUS_INSTALLATION = "none"
    static readonly POLICIES = {...serviceWorkerPolicies} as const

    static readonly statuses = {
        updateError: 0,
        updateNotEnoughDiskSpace: 1,
        updateNotAvailable: 2,
        updateQueued: 3,
        sameUpdateInProgress: 4,
        updateAlreadyQueue: 5,
    } as const

    fetchFile: FetchFunction
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

    constructor({
        fetchFile,
        fileCache,
        downloadManager,
        origin
    }: ShabahOptions) {
        this.fetchFile = fetchFile
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
        requestUrl: string
        name: string
        id: string
    }) {
        const {fetchFile, fileCache} = this
        const response = await checkForUpdates({
            requestRootUrl: cargo.requestUrl,
            storageRootUrl: cargo.storageUrl,
            name: cargo.name
        }, fetchFile, fileCache)
        const disk = await this.diskInfo()
        const diskWithCargo = disk.used + response.bytesToDownload
        const enoughSpaceForPackage = disk.total < 1
            ? false
            : diskWithCargo < disk.total
        const bytesNeededToDownload = Math.max(
            0, (diskWithCargo - disk.total) * DISK_CLEAR_MULTIPLIER
        )
        const byteMultiplier = ((b: number) => {
            if (b > bytes.bytes_per_gb) {
                return {factor: bytes.bytes_per_gb, metric: "gb"}
            } else if (b > bytes.bytes_per_mb) {
                return {factor: bytes.bytes_per_mb, metric: "mb"}
            } else {
                return {factor: bytes.bytes_per_kb, metric: "kb"}
            }
        })(bytesNeededToDownload)
        const previousVersion = (
            response.previousCargo?.version 
            || Shabah.NO_PREVIOUS_INSTALLATION
        )
        const newVersion = (
             response.newCargo?.parsed.version
            || Shabah.NO_PREVIOUS_INSTALLATION
        )
        return {
            updateCheckResponse: response,
            versions: {new: newVersion, old: previousVersion},
            errorOccurred: response.errors.length > 0,
            enoughSpaceForPackage,
            updateAvailable: !!response.newCargo,
            diskInfo: {
                ...disk,
                usageAfterDownload: diskWithCargo,
                bytesNeededToDownload,
                bytesNeededToDownloadFriendly: (
                    Math.max(
                        0.01,
                        roundDecimal(bytesNeededToDownload / byteMultiplier.factor, 2)
                    ).toString()
                    + byteMultiplier.metric
                ),
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

    private async getCargoIndices() {
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
        if (!details.updateAvailable) {
            return io.ok({
                msg: "update not available", 
                code: Shabah.statuses.updateNotAvailable
            })
        } else if (!details.enoughSpaceForPackage) {
            return io.ok({
                msg: "not enough disk space for update", 
                code: Shabah.statuses.updateNotEnoughDiskSpace
            })
        } else if (details.errorOccurred) {
            return io.ok({
                msg: "error occurred when searching for update", 
                code: Shabah.statuses.updateError
            })
        }
        const downloadsIndex = await this.getDownloadIndices()
        const prevUpdateIndex = downloadsIndex.downloads.findIndex((index) => {
            return index.id === details.id
        })
        const updateInProgress = prevUpdateIndex > -1
        if (updateInProgress) {
            return io.ok({
                msg: "update is already in progress",
                code: Shabah.statuses.sameUpdateInProgress
            })
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
            storageRootUrl: details.storageUrl
        }
        const {fileCache, downloadManager} = this
        updateDownloadIndex(downloadsIndex, updateIndex)
        const newCargo = details.updateCheckResponse.newCargo!
        await Promise.all([
            this.persistDownloadIndices(downloadsIndex),
            fileCache.putFile(
                newCargo.storageUrl, 
                new Response(newCargo.text, {
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
                    name: details.name,
                    id: details.id,
                    state: "updating",
                    version: details.versions.new,
                    entry: newCargo.parsed.entry,
                    bytes: details.updateCheckResponse.totalBytes,
                    storageRootUrl: details.storageUrl,
                    requestRootUrl: details.requestUrl
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
        return io.ok({
            msg: "update queued", 
            code: Shabah.statuses.updateQueued
        })
    }

    async getCargoMeta(cargoId: string) {
        const indices = await this.getCargoIndices()
        const index = indices.cargos.findIndex((cargo) => cargo.id === cargoId)
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
                const downloadIndex = await self
                    .getDownloadState(id)
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
}