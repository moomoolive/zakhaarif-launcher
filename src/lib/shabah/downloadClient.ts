import {
    checkForUpdates,
    createResourceMap,
    STATUS_CODES,
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
    DownloadIndex,
    removeDownloadIndex,
    NO_UPDATE_QUEUED,
} from "./backend"
import {BYTES_PER_MB} from "../utils/consts/storage"
import {MANIFEST_NAME, NULL_FIELD} from "../cargo/index"
import {Cargo} from "../cargo/index"
import {resultJsonParse} from "../monads/utils/jsonParse"
import {GeneralPermissions} from "../utils/security/permissionsSummary"
import {addSlashToEnd} from "../utils/urls/addSlashToEnd"
import { NO_INSTALLATION } from "./utility"
import {UpdateCheckResponse} from "./updateCheckStatus"
import { nanoid } from "nanoid"

export type {CargoIndex, CargoIndices, CargoState} from "./backend"
export {emptyCargoIndices} from "./backend"

const SYSTEM_RESERVED_BYTES = 200 * BYTES_PER_MB

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
    },
    permissionsCleaner?: (permissions: GeneralPermissions) => GeneralPermissions
}

export class Shabah {
    static readonly NO_PREVIOUS_INSTALLATION = NO_INSTALLATION
    static readonly POLICIES = serviceWorkerPolicies
    static readonly STATUS = STATUS_CODES

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
    private permissionsCleaner: null | (
        (permissions: GeneralPermissions) => GeneralPermissions
    )

    constructor({adaptors, origin, permissionsCleaner}: ShabahProps) {
        if (!origin.startsWith("https://") && !origin.startsWith("http://")) {
            throw new Error("origin of download client must be full url, starting with https:// or http://")
        }
        const {networkRequest, fileCache, downloadManager} = adaptors
        this.permissionsCleaner = permissionsCleaner || null
        this.networkRequest = networkRequest
        this.fileCache = fileCache
        this.downloadManager = downloadManager
        this.origin = origin.endsWith("/") ? origin.slice(0, -1) : origin
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
        canonicalUrl: string
        id: string
    }) {
        if (!cargo.canonicalUrl.startsWith("https://") && !cargo.canonicalUrl.startsWith("http://")) {
            throw new Error("cargo canonical url must be a full url, starting with https:// or http://")
        }
        const cargoIndex = await this.getCargoIndexByCanonicalUrl(
            cargo.canonicalUrl
        )
        
        const response = await checkForUpdates({
            canonicalUrl: cargo.canonicalUrl,
            oldResolvedUrl: cargoIndex?.resolvedUrl || "",
            name: cargo.id
        }, this.networkRequest, this.fileCache)
        
        if (response.newCargo && this.permissionsCleaner) {
            const permissions = response.newCargo.parsed.permissions
            response.newCargo.parsed.permissions = this.permissionsCleaner(permissions)
        }

        return new UpdateCheckResponse({
            status: response.code,
            id: cargoIndex?.id || cargo.id,
            originalResolvedUrl: cargoIndex?.resolvedUrl || "",
            resolvedUrl: response.newCargo?.resolvedUrl || "",
            canonicalUrl: addSlashToEnd(cargo.canonicalUrl),
            errors: response.errors,
            newCargo: response.newCargo?.parsed || null,
            originalNewCargoResponse: response.newCargo?.response || new Response(),
            previousCargo: response.previousCargo || null,
            download: {
                downloadableResources: response.downloadableResources,
                resourcesToDelete: response.resoucesToDelete,
            },
            diskInfo: {
                raw: await this.diskInfo(),
                cargoStorageBytes: cargoIndex?.storageBytes || 0
            },
        })
    }

    async executeUpdates(
        details: UpdateCheckResponse,
        updateTitle: string,
    ) {
        if (details.errorOccurred()) {
            return io.ok(STATUS_CODES.updateImpossible)
        }
        if (!details.updateAvailable() || !details.newCargo) {
            return io.ok(STATUS_CODES.newCargoMissing)
        } 
        if (!details.enoughStorageForCargo()) {
            return io.ok(STATUS_CODES.insufficentDiskSpace)
        }

        const downloadIndex = await this.getDownloadIndexByCanonicalUrl(
            details.canonicalUrl
        )
        const updateInProgress = !!downloadIndex
        if (updateInProgress) {
            return io.ok(STATUS_CODES.updateAlreadyQueued)
        }

        // in case there is a mismatch between the underlying
        // download manager and the download client
        // check that the download manager also doesn't
        // have the same update queued
        const updateCargoIndex = await this.getCargoIndexByCanonicalUrl(
            details.canonicalUrl
        )
        const cargoIndexExists = !!updateCargoIndex
        const updateQueued = updateCargoIndex?.downloadQueueId !== NO_UPDATE_QUEUED
        const downloadManagerHasUpdateRecord = updateQueued
            ? !!(await this.downloadManager.getDownloadState(updateCargoIndex?.downloadQueueId || ""))
            : false
        if (
            cargoIndexExists
            && updateQueued
            && downloadManagerHasUpdateRecord
        ) {
            return io.ok(STATUS_CODES.downloadManagerUnsyncedState)
        }

        const downloadQueueId = nanoid(21)
        
        await Promise.all([
            this.putDownloadIndex({
                id: downloadQueueId,
                previousId: "",
                bytes: details.downloadMetadata().bytesToDownload,
                segments: [
                    {
                        map: createResourceMap(details.downloadMetadata().downloadableResources),
                        version: details.versions().new,
                        previousVersion: details.versions().old,
                        resolvedUrl: details.resolvedUrl,
                        canonicalUrl: details.canonicalUrl,
                        bytes: details.downloadMetadata().bytesToDownload,
                    }
                ],
                title: updateTitle,
            }),

            this.fileCache.putFile(
                details.resolvedUrl + MANIFEST_NAME, 
                new Response(JSON.stringify(details.newCargo), {
                    status: 200,
                    statusText: "OK",
                    headers: headers(
                        "application/json",
                        stringBytes(await details.originalNewCargoResponse.text())
                    )
                })
            ),

            this.putCargoIndex({
                name: details.newCargo.name,
                id: details.id,
                state: "updating",
                permissions: details.newCargo.permissions,
                version: details.versions().new,
                entry: details.newCargo.entry === NULL_FIELD
                    ? NULL_FIELD
                    : details.resolvedUrl + details.newCargo.entry,
                bytes: details.downloadMetadata().cargoTotalBytes,
                resolvedUrl: details.resolvedUrl,
                canonicalUrl: details.canonicalUrl,
                logoUrl: details.newCargo.crateLogoUrl,
                storageBytes: details.diskInfo.cargoStorageBytes,
                downloadQueueId: downloadQueueId,
            })
        ] as const)
        
        const self = this
        const filesToDelete = details.downloadMetadata().resourcesToDelete
        await Promise.all(filesToDelete.map(
            (file) => self.fileCache.deleteFile(file.storageUrl)
        ))

        const downloadFiles = details.downloadMetadata().downloadableResources
        await this.downloadManager.queueDownload(
            downloadQueueId,
            downloadFiles.map((file) => file.requestUrl),
            {
                title: updateTitle, 
                downloadTotal: details.downloadMetadata().bytesToDownload
            }
        )

        return io.ok(STATUS_CODES.updateQueued)
    }

    addProgressListener(
        id: string, 
        callback: onProgressCallback
    ) {
        const listenerIndex = this.progressListeners.findIndex(
            (listener) => listener.id === id
        )
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
                    self.getCargoIndexById(id)
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
        const cargoMeta = await this.getCargoIndexById(id)
        if (!cargoMeta || cargoMeta.state === "archived") {
            return io.ok(STATUS_CODES.notFound)
        }
        const {state} = cargoMeta
        if (state !== "update-aborted" && state !== "update-failed") {
            return io.ok(STATUS_CODES.updateRetryImpossible)
        }
        const {resolvedUrl} = cargoMeta
        const errDownloadIndexRes = await getErrorDownloadIndex(
            resolvedUrl, this.fileCache
        )
        if (!errDownloadIndexRes) {
            return io.ok(STATUS_CODES.errorIndexNotFound)
        }
        const prevUpdateIndex = this.getDownloadIndexByCanonicalUrl(
            cargoMeta.canonicalUrl
        )
        //const downloadsIndex = await this.getDownloadIndices()
        //const prevUpdateIndex = downloadsIndex.downloads.findIndex(
        //    (index) => index.id === id
        //)
        const updateInProgress = !!prevUpdateIndex
        if (updateInProgress) {
            return io.ok(STATUS_CODES.updateAlreadyQueued)
        }
        const {index: errDownloadIndex} = errDownloadIndexRes
        if (errDownloadIndex.segments.length < 1) {
            return io.ok(STATUS_CODES.noSegmentsFound)
        }
        if (errDownloadIndex.segments.length > 1) {
            return io.ok(STATUS_CODES.invalidErrorDownloadIndex)
        }
        const downloadQueueId = errDownloadIndex.id
        const targetSegment = errDownloadIndex.segments[0]
        const downloadsIndex = await this.getDownloadIndices()
        updateDownloadIndex(downloadsIndex, errDownloadIndex)
        await Promise.all([
            this.persistDownloadIndices(downloadsIndex),
            this.putCargoIndex({...cargoMeta, state: "updating", downloadQueueId})
        ])
        const {title, bytes} = errDownloadIndex
        await this.downloadManager.queueDownload(
            downloadQueueId,
            Object.keys(targetSegment.map),
            {title, downloadTotal: bytes}
        )
        return io.ok(STATUS_CODES.updateRetryQueued)
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
        return io.ok(STATUS_CODES.cached)
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
        const fullCargo = await this.getCargoAtUrl(resolvedUrl)
        if (!fullCargo.ok) {
            return io.err(`cargo does not exist in hard drive`)
        }
        const {pkg} = fullCargo.data
        // add to cargo.json to files so that it 
        // can be deleted along side it's files
        pkg.files.push({
            name: MANIFEST_NAME, 
            bytes: 0, 
            invalidation: "default"
        })
        const fileCache = this.fileCache
        const deleteResponses = await Promise.all(pkg.files.map(
            (file) => fileCache.deleteFile(`${resolvedUrl}${file.name}`)
        ))
        return deleteResponses.reduce(
            (total, next) => total && next, true
        )
    }

    async deleteCargo(canonicalUrl: string) {
        const cargoIndex = await this.getCargoIndices()
        const index = cargoIndex.cargos.findIndex(
            (cargo) => cargo.canonicalUrl === canonicalUrl
        )
        if (index < 0) {
            return io.ok(STATUS_CODES.notFound)
        }
        const targetCargo = cargoIndex.cargos[index]
        await this.deleteAllCargoFiles(
            targetCargo.resolvedUrl
        )
        return io.ok(
            await this.deleteCargoIndex(targetCargo.canonicalUrl)
        )
    }

    async archiveCargo(canonicalUrl: string) {
        const cargoIndex = await this.getCargoIndices()
        const index = cargoIndex.cargos.findIndex(
            (cargo) => cargo.canonicalUrl === canonicalUrl
        )
        if (index < 0) {
            return io.ok(STATUS_CODES.notFound)
        }
        const targetCargo = cargoIndex.cargos[index]
        await this.deleteAllCargoFiles(
            targetCargo.resolvedUrl
        )
        targetCargo.state = "archived"
        await this.persistCargoIndices(cargoIndex)
        return io.ok(STATUS_CODES.ok)
    }

    // archived cargo index interfaces
    getArchivedCargoIndexByCanonicalUrl = this.getCargoIndexByCanonicalUrl

    // cargo index interfaces
    async getCargoIndexById(cargoId: string) {
        const indices = await this.getCargoIndices()
        const index = indices.cargos.findIndex((cargo) => cargo.id === cargoId)
        if (index < 0) {
            return null
        }
        return indices.cargos[index]
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

    async putCargoIndex(newIndex: CargoIndexWithoutMeta) {
        const indices = await this.getCargoIndices()
        updateCargoIndex(indices, newIndex)
        return await this.persistCargoIndices(indices)
    }

    async getCargoIndexByEntry(entryUrl: string) {
        const indices = await this.getCargoIndices()
        const index = indices.cargos.findIndex((cargo) => cargo.entry === entryUrl)
        if (index < 0) {
            return null
        }
        return indices.cargos[index]
    }

    async getCargoIndexByCanonicalUrl(canonicalUrl: string) {
        const indices = await this.getCargoIndices()
        const index = indices.cargos.findIndex((cargo) => cargo.canonicalUrl === canonicalUrl)
        if (index < 0) {
            return null
        }
        return indices.cargos[index]
    }

    async deleteCargoIndex(canonicalUrl: string) {
        const indexes = await this.getCargoIndices()
        const cargoIndex = indexes.cargos.findIndex(
            (cargo) => cargo.canonicalUrl === canonicalUrl
        )
        if (cargoIndex < 0) {
            return STATUS_CODES.notFound
        }
        indexes.cargos.splice(cargoIndex, 1)
        await this.persistCargoIndices(indexes)
        return STATUS_CODES.ok
    }

    // download index interfaces
    async getDownloadIndexByCanonicalUrl(canonicalUrl: string) {
        const indexes = await this.getDownloadIndices()
        const targetIndex = indexes.downloads.findIndex((index) => {
            const {segments} = index
            const targetIndex = segments.findIndex(
                (segment) => segment.canonicalUrl === canonicalUrl
            )
            return targetIndex > -1
        })
        if (targetIndex < 0) {
            return null
        }
        return indexes.downloads[targetIndex]
    }

    async putDownloadIndex(
        updatedIndex: Omit<DownloadIndex, "startedAt">
    ) {
        const downloadsIndex = await this.getDownloadIndices()
        updateDownloadIndex(downloadsIndex, updatedIndex)
        return this.persistDownloadIndices(downloadsIndex)
    }

    async deleteDownloadIndex(canonicalUrl: string) {
        const target = await this.getDownloadIndexByCanonicalUrl(
            canonicalUrl
        )
        if (!target) {
            return io.ok(STATUS_CODES.notFound)
        }
        const indexes = await this.getDownloadIndices()
        removeDownloadIndex(indexes, canonicalUrl)
        return io.ok(STATUS_CODES.ok)
    }

    async getDownloadIndices() {
        if (this.downloadIndicesCache) {
            return this.downloadIndicesCache
        }
        return this.refreshDownloadIndicies()
    }

    private async persistDownloadIndices(indices: DownloadIndexCollection) {
        const {origin, fileCache} = this
        return await saveDownloadIndices(indices, origin, fileCache)
    }

    async getDownloadState(canonicalUrl: string) {
        const downloadsIndex = await this.getDownloadIndices()
        const updateIndex = downloadsIndex.downloads.find((index) => {
            const {segments} = index
            const target = segments.findIndex(
                (segment) => segment.canonicalUrl === canonicalUrl
            )
            return target
        })
        if (!updateIndex) {
            return null
        }
        const {segments} = updateIndex
        const targetSegmentIndex = segments.findIndex(
            (segment) => segment.canonicalUrl === canonicalUrl
        )
        const targetSegment = segments[targetSegmentIndex]
        return {
            id: updateIndex.id,
            title: updateIndex.title,
            startedAt: updateIndex.startedAt,
            ...targetSegment
        }
    }

    private async refreshDownloadIndicies() {
        const {origin, fileCache} = this
        const indices = await getDownloadIndices(origin, fileCache)
        this.downloadIndicesCache = indices
        return indices
    }
}