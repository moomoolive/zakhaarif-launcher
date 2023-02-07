import {
    checkForUpdates,
    createResourceMap,
    ERROR_CODES_START,
    StatusCode,
    STATUS_CODES,
} from "./client"
import {io, Ok} from "../monads/result"
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
    DownloadSegment,
    removeSlashAtEnd,
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
import { DeepReadonly } from "../types/utility"

export type {CargoIndex, CargoIndices, CargoState} from "./backend"
export {emptyCargoIndices} from "./backend"

const SYSTEM_RESERVED_BYTES = 200 * BYTES_PER_MB

type DownloadStateSummary = DownloadState & {
    previousVersion: string
    version: string
}

export type ShabahConfig = {
    origin: string,
    adaptors: {
        fileCache: FileCache
        networkRequest: FetchFunction
        downloadManager: DownloadManager
    },
    permissionsCleaner?: (permissions: GeneralPermissions) => GeneralPermissions
}

export const archivedCargoIndexesUrl = (origin: string) => `${removeSlashAtEnd(origin)}/__archived-cargo-indexes__.json`

export class Shabah {
    static readonly NO_PREVIOUS_INSTALLATION = NO_INSTALLATION
    static readonly POLICIES = serviceWorkerPolicies
    static readonly STATUS = STATUS_CODES
    static readonly ERROR_CODES_START = ERROR_CODES_START

    readonly origin: string

    private networkRequest: FetchFunction
    private fileCache: FileCache
    private downloadManager: DownloadManager
    private cargoIndicesCache: null | CargoIndices
    private downloadIndicesCache: null | DownloadIndexCollection
    private permissionsCleaner: null | (
        (permissions: GeneralPermissions) => GeneralPermissions
    )

    constructor({adaptors, origin, permissionsCleaner}: ShabahConfig) {
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

    async checkForUpdates(cargo: {
        canonicalUrl: string
        tag: string
    }): Promise<UpdateCheckResponse> {
        if (!cargo.canonicalUrl.startsWith("https://") && !cargo.canonicalUrl.startsWith("http://")) {
            throw new Error("cargo canonical url must be a full url, starting with https:// or http://")
        }
        const cargoIndex = await this.getCargoIndexByCanonicalUrl(
            cargo.canonicalUrl
        )
        const response = await checkForUpdates({
            canonicalUrl: cargo.canonicalUrl,
            oldResolvedUrl: cargoIndex?.resolvedUrl || "",
        }, this.networkRequest, this.fileCache)
        
        if (response.newCargo && this.permissionsCleaner) {
            const permissions = response.newCargo.parsed.permissions
            response.newCargo.parsed.permissions = this.permissionsCleaner(permissions)
        }

        return new UpdateCheckResponse({
            status: response.code,
            tag: cargo.tag,
            originalResolvedUrl: cargoIndex?.resolvedUrl || "",
            resolvedUrl: response.newCargo?.resolvedUrl || "",
            canonicalUrl: addSlashToEnd(cargo.canonicalUrl),
            errors: response.errors,
            newCargo: response.newCargo?.parsed || null,
            originalNewCargoResponse: response.newCargo?.response || new Response(),
            previousCargo: response.previousCargo || null,
            downloadableResources: response.downloadableResources,
            resourcesToDelete: response.resoucesToDelete,
            diskInfo: await this.diskInfo(),
            cargoStorageBytes: cargoIndex?.storageBytes || 0
        })
    }

    async executeUpdates(
        updates: UpdateCheckResponse[],
        title: string,
    ): Promise<Ok<StatusCode>> {
        if (updates.length < 1) {
            return io.ok(STATUS_CODES.zeroUpdatesProvided)
        }

        for (const update of updates) {
            if (update.errorOccurred()) {
                return io.ok(STATUS_CODES.updateImpossible)
            }
            if (!update.updateAvailable()) {
                return io.ok(STATUS_CODES.newCargoMissing)
            } 
            if (!update.enoughStorageForCargo()) {
                return io.ok(STATUS_CODES.insufficentDiskSpace)
            }
    
            const downloadIndex = await this.getDownloadIndexByCanonicalUrl(
                update.canonicalUrl
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
                update.canonicalUrl
            )
            const updateQueued = updateCargoIndex?.downloadQueueId !== NO_UPDATE_QUEUED
            if (!updateCargoIndex || !updateQueued) {
                continue
            }

            const downloadManagerResponse = await io.wrap(this.downloadManager.getDownloadState(updateCargoIndex.downloadQueueId))
            if (
                downloadManagerResponse.ok 
                && !!downloadManagerResponse.data
            ) {
                return io.ok(STATUS_CODES.downloadManagerUnsyncedState)
            }
        }        
        
        let byteCount = 0
        const filesToRequest = []
        const filesToDelete = []
        for (const update of updates) {
            byteCount += update.downloadMetadata().bytesToDownload
            
            const metadata = update.downloadMetadata()
            const removeFiles = metadata.resourcesToDelete.map(
                (file) => file.storageUrl
            )
            filesToDelete.push(...removeFiles)
            const addFiles = metadata.downloadableResources.map(
                (file) => file.requestUrl
            )
            filesToRequest.push(...addFiles)
        }

        const resourcesToRequest = filesToRequest.length > 0
        const downloadQueueId = resourcesToRequest ? nanoid(21) : NO_UPDATE_QUEUED
        const downloadIndex = {
            id: downloadQueueId,
            previousId: "",
            bytes: byteCount,
            segments: [] as DownloadSegment[],
            title
        }
        const promises: Promise<unknown>[] = []
        for (const update of updates) {
            
            promises.push(this.fileCache.putFile(
                update.resolvedUrl + MANIFEST_NAME, 
                new Response(JSON.stringify(update.newCargo), {
                    status: 200,
                    statusText: "OK",
                    headers: headers(
                        "application/json",
                        stringBytes(await update.originalNewCargoResponse.text())
                    )
                })
            ))
            
            promises.push(this.putCargoIndex({
                name: update.newCargo?.name || "none",
                tag: update.tag,
                state: !resourcesToRequest ? "cached" : "updating",
                permissions: update.newCargo?.permissions || [],
                version: update.versions().new,
                entry: update.newCargo?.entry === NULL_FIELD
                    ? NULL_FIELD
                    : update.resolvedUrl + (update.newCargo?.entry || ""),
                bytes: update.downloadMetadata().cargoTotalBytes,
                resolvedUrl: update.resolvedUrl,
                canonicalUrl: update.canonicalUrl,
                logoUrl: update.newCargo?.crateLogoUrl || "",
                storageBytes: update.cargoStorageBytes,
                downloadQueueId: downloadQueueId,
            }))

            if (downloadQueueId === NO_UPDATE_QUEUED) {
                continue
            }

            downloadIndex.segments.push({
                map: createResourceMap(update.downloadableResources),
                version: update.versions().new,
                previousVersion: update.versions().old,
                resolvedUrl: update.resolvedUrl,
                canonicalUrl: update.canonicalUrl,
                bytes: update.downloadMetadata().bytesToDownload,
                resourcesToDelete: filesToDelete
            })
        }

        for (const url of filesToDelete) {
            promises.push(this.fileCache.deleteFile(url))
        }

        await Promise.all(promises)

        if (!resourcesToRequest) {
            return io.ok(STATUS_CODES.noDownloadbleResources)
        }

        await this.putDownloadIndex(downloadIndex)
        await this.downloadManager.queueDownload(
            downloadQueueId,
            filesToRequest,
            {
                title,
                downloadTotal: downloadIndex.bytes 
            }
        )

        return io.ok(STATUS_CODES.updateQueued)
    }

    async retryFailedDownloads(
        canonicalUrls: string[],
        title: string
    ): Promise<Ok<StatusCode>> {

        if (canonicalUrls.length < 1) {
            return io.ok(STATUS_CODES.zeroUpdatesProvided)
        }

        const errorReports = []
        for (const canonicalUrl of canonicalUrls) {
            const cargoMeta = await this.getCargoIndexByCanonicalUrl(
                canonicalUrl
            )
            if (!cargoMeta) {
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
            const prevUpdateIndex = await this.getDownloadIndexByCanonicalUrl(
                cargoMeta.canonicalUrl
            )
            const updateInProgress = !!prevUpdateIndex
            if (updateInProgress) {
                return io.ok(STATUS_CODES.downloadManagerUnsyncedState)
            }
    
            const errorReport = errDownloadIndexRes
            const {index: errDownloadIndex} = errorReport
            if (errDownloadIndex.segments.length < 1) {
                return io.ok(STATUS_CODES.noSegmentsFound)
            }
            if (errDownloadIndex.segments.length > 1) {
                return io.ok(STATUS_CODES.invalidErrorDownloadIndex)
            }
            errorReports.push({errorReport, cargoMeta})
        }

        const downloadsIndex = await this.getDownloadIndices()
        const removeFileUrls = []
        const requestFileUrls = []
        const downloadQueueId = nanoid(21)
        const retryDownloadIndex = {
            id: downloadQueueId,
            previousId: "",
            bytes: 0,
            segments: [] as DownloadSegment[],
            title
        }
        for (const {errorReport, cargoMeta} of errorReports) {
            const {index, url} = errorReport
            removeFileUrls.push(url)
            const [targetSegment] = index.segments
            requestFileUrls.push(...Object.keys(targetSegment.map))
            retryDownloadIndex.segments.push(targetSegment)
            retryDownloadIndex.bytes += index.bytes
            this.putCargoIndex({
                ...cargoMeta, 
                state: "updating", 
                downloadQueueId
            })
        }
        updateDownloadIndex(downloadsIndex, retryDownloadIndex)
        const self = this
        await Promise.all([
            this.persistDownloadIndices(downloadsIndex),
            ...removeFileUrls.map((url) => self.fileCache.deleteFile(url))
        ])
        await this.downloadManager.queueDownload(
            downloadQueueId,
            requestFileUrls,
            {title, downloadTotal: retryDownloadIndex.bytes}
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
            pkg: new Cargo(cargoFileJson.data as Cargo),
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

    private async removeCargoFromDownloadQueue(
        canonicalUrl: string
    ): Promise<StatusCode> {
        const targetIndex = await this.getDownloadIndexByCanonicalUrl(
            canonicalUrl
        )
        if (!targetIndex) {
            return STATUS_CODES.notFound
        }
        const targetSegmentIndex = targetIndex.segments.findIndex(
            (segment) => segment.canonicalUrl === canonicalUrl
        )
        targetIndex.segments.splice(targetSegmentIndex, 1)
        const indexes = await this.getDownloadIndices()
        if (targetIndex.segments.length < 1) {
            removeDownloadIndex(indexes, canonicalUrl)
            this.downloadManager.cancelDownload(targetIndex.id)
        }
        this.persistDownloadIndices(indexes)
        return STATUS_CODES.ok
    }

    async deleteCargo(canonicalUrl: string): Promise<Ok<StatusCode>> {
        const cargoIndex = await this.getCargoIndices()
        const index = cargoIndex.cargos.findIndex(
            (cargo) => cargo.canonicalUrl === canonicalUrl
        )
        if (index < 0) {
            return io.ok(STATUS_CODES.notFound)
        }
        const targetCargo = cargoIndex.cargos[index]
        const promises = []
        promises.push(this.deleteAllCargoFiles(
            targetCargo.resolvedUrl
        ))
        if (
            targetCargo.state === "updating" 
            && targetCargo.downloadQueueId !== NO_UPDATE_QUEUED
        ) {
            promises.push(this.removeCargoFromDownloadQueue(canonicalUrl))
        }
        await Promise.all(promises)
        return io.ok(
            await this.deleteCargoIndex(targetCargo.canonicalUrl)
        )
    }

    // cargo index interfaces
    async getCargoIndexByCanonicalUrl(canonicalUrl: string) {
        const indices = await this.getCargoIndices()
        const index = indices.cargos.findIndex(
            (cargo) => cargo.canonicalUrl === canonicalUrl
        )
        if (index < 0) {
            return null
        }
        return indices.cargos[index]
    }

    async refreshCargoIndices() {
        const {origin, fileCache} = this
        const cargos = await getCargoIndices(origin, fileCache)
        this.cargoIndicesCache = cargos
        return cargos
    }

    async getCargoIndices(): Promise<DeepReadonly<CargoIndices>> {
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
    async getDownloadIndexByCanonicalUrl(
        canonicalUrl: string
    ): Promise<DownloadIndex | null> {
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
        this.persistDownloadIndices(indexes)
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

    private async refreshDownloadIndicies() {
        const {origin, fileCache} = this
        const indices = await getDownloadIndices(origin, fileCache)
        this.downloadIndicesCache = indices
        return indices
    }

    // progress listening interfaces
    async getDownloadState(canonicalUrl: string): Promise<null | DownloadStateSummary> {
        const [cargoIndex, downloadIndex] = await Promise.all([
            this.getCargoIndexByCanonicalUrl(canonicalUrl),
            this.getDownloadIndexByCanonicalUrl(canonicalUrl)
        ] as const)
        if (!cargoIndex || !downloadIndex) {
            return null
        }
        if (cargoIndex.downloadQueueId === NO_UPDATE_QUEUED) {
            return null
        }
        const managerResponse = await io.wrap(
            this.downloadManager.getDownloadState(cargoIndex.downloadQueueId)
        )
        if (!managerResponse.ok || !managerResponse.data) {
            return null
        }
        const response = managerResponse.data
        const segmentIndex = downloadIndex.segments.findIndex(
            (segment) => segment.canonicalUrl === canonicalUrl 
        ) 
        const {previousVersion, version} = downloadIndex.segments[segmentIndex]
        return {...response, previousVersion, version}
    }
}