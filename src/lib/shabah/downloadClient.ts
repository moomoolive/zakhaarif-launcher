import {
    checkForUpdates,
    createResourceMap,
    ERROR_CODES_START,
    StatusCode,
    STATUS_CODES,
} from "./client"
import {io, Ok} from "../monads/result"
import {
    ManifestIndexWithoutMeta,
    headers,
    FetchFunction,
    FileCache,
    DownloadManager,
    DownloadState,
    getErrorDownloadIndex,
    rootDocumentFallBackUrl,
    DownloadIndex,
    NO_UPDATE_QUEUED,
    DownloadSegment,
    removeSlashAtEnd,
    CACHED,
    UPDATING,
    ABORTED,
    FAILED,
    ClientMessageChannel,
    DownloadClientManifestIndexStorage,
    ManifestIndex,
    BackendMessageChannel
} from "./backend"
import {serviceWorkerPolicies} from "./serviceWorkerMeta"
import {BYTES_PER_MB} from "../utils/consts/storage"
import {NULL_FIELD, HuzmaManifest} from "huzma"
import {resultJsonParse} from "../monads/utils/jsonParse"
import {GeneralPermissions} from "../utils/security/permissionsSummary"
import {addSlashToEnd} from "../utils/urls/addSlashToEnd"
import { NO_INSTALLATION } from "./utility"
import {UpdateCheckResponse} from "./updateCheckStatus"
import { nanoid } from "nanoid"
import { getFileNameFromUrl } from "../utils/urls/getFilenameFromUrl"
import {stringBytes} from "../utils/stringBytes"

export type {ManifestIndex, ManifestState} from "./backend"

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
        virtualFileCache: FileCache
    },
    clientMessageChannel: ClientMessageChannel
    backendMessageChannel: BackendMessageChannel
    indexStorage: DownloadClientManifestIndexStorage
    permissionsCleaner?: (permissions: GeneralPermissions) => GeneralPermissions
}

export const archivedCargoIndexesUrl = (origin: string) => `${removeSlashAtEnd(origin)}/__archived-cargo-indexes__.json`

const provisionDownloadId = () => nanoid(9)

export class Shabah {
    static readonly NO_PREVIOUS_INSTALLATION = NO_INSTALLATION
    static readonly POLICIES = serviceWorkerPolicies
    static readonly STATUS = STATUS_CODES
    static readonly ERROR_CODES_START = ERROR_CODES_START

    readonly origin: string

    private networkRequest: FetchFunction
    private fileCache: FileCache
    private virtualFileCache: FileCache
    private downloadManager: DownloadManager
    private clientMessageChannel: ClientMessageChannel
    private backendMessageChannel: BackendMessageChannel
    private indexStorage: DownloadClientManifestIndexStorage
    private permissionsCleaner: null | (
        (permissions: GeneralPermissions) => GeneralPermissions
    )

    constructor({
        adaptors, 
        origin, 
        permissionsCleaner,
        clientMessageChannel,
        indexStorage,
        backendMessageChannel
    }: ShabahConfig) {
        if (!origin.startsWith("https://") && !origin.startsWith("http://")) {
            throw new Error("origin of download client must be full url, starting with https:// or http://")
        }
        const {
            networkRequest, fileCache, 
            downloadManager, virtualFileCache
        } = adaptors
        this.permissionsCleaner = permissionsCleaner || null
        this.clientMessageChannel = clientMessageChannel
        this.indexStorage = indexStorage
        this.networkRequest = networkRequest
        this.fileCache = fileCache
        this.virtualFileCache = virtualFileCache
        this.downloadManager = downloadManager
        this.origin = origin.endsWith("/") ? origin.slice(0, -1) : origin
        this.backendMessageChannel = backendMessageChannel
    }

    async diskInfo() {
        const [diskusage, downloadIndices] = await Promise.all([
            this.fileCache.queryUsage(),
            this.backendMessageChannel.getAllMessages()
        ] as const)
        const currentDownloadBytes = downloadIndices.reduce(
            (total, next) => total + next.bytes,
            0
        )
        const used = diskusage.usage + currentDownloadBytes
        const total = Math.max(
            diskusage.quota - SYSTEM_RESERVED_BYTES,
            0
        )
        const left = total - used
        return {used, total, left}
    }

    async checkForUpdates(cargo: {
        canonicalUrl: string
        tag: number
    }): Promise<UpdateCheckResponse> {
        const cargoIndex = await this.getCargoIndexByCanonicalUrl(
            cargo.canonicalUrl
        )
        const oldResolvedUrl = cargoIndex?.resolvedUrl || ""
        const oldManifestName = cargoIndex?.manifestName || ""
        const response = await checkForUpdates({
            canonicalUrl: cargo.canonicalUrl,
            oldResolvedUrl,
            oldManifestName
        }, this.networkRequest, this.fileCache)
        
        if (response.newCargo && this.permissionsCleaner) {
            const permissions = response.newCargo.parsed.permissions
            response.newCargo.parsed.permissions = this.permissionsCleaner(permissions)
        }

        return new UpdateCheckResponse({
            status: response.code,
            tag: cargo.tag,
            originalResolvedUrl: oldResolvedUrl,
            resolvedUrl: response.newCargo?.resolvedUrl || "",
            canonicalUrl: cargo.canonicalUrl,
            errors: response.errors,
            newCargo: response.newCargo?.parsed || null,
            originalNewCargoResponse: response.newCargo?.response || new Response(),
            previousCargo: response.previousCargo || null,
            downloadableResources: response.downloadableResources,
            resourcesToDelete: response.resoucesToDelete,
            diskInfo: await this.diskInfo(),
            manifestName: response.manifestName,
            oldManifestName
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
                return io.ok(STATUS_CODES.updateNotAvailable)
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
            const updateQueued = updateCargoIndex?.downloadId !== NO_UPDATE_QUEUED
            if (!updateCargoIndex || !updateQueued) {
                continue
            }

            const downloadManagerResponse = await io.wrap(
                this.downloadManager.getDownloadState(updateCargoIndex.downloadId)
            )
            if (
                downloadManagerResponse.ok 
                && !!downloadManagerResponse.data
            ) {
                return io.ok(STATUS_CODES.downloadManagerUnsyncedState)
            }
        }        
        
        let byteCount = 0
        const filesToRequest: string[] = []
        const filesToDelete: string[] = []
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
        const downloadQueueId = resourcesToRequest 
            ? provisionDownloadId() 
            : NO_UPDATE_QUEUED
        const downloadIndex: DownloadIndex = {
            id: downloadQueueId,
            previousId: "",
            bytes: byteCount,
            segments: [] as DownloadSegment[],
            title,
            startedAt: Date.now()
        }
        const promises: Promise<unknown>[] = []
        for (const update of updates) {
            const manifestName = update.resolvedUrl + update.manifestName
            promises.push(this.fileCache.putFile(
                manifestName,
                new Response(JSON.stringify(update.newCargo), {
                    status: 200,
                    statusText: "OK",
                    headers: headers(
                        "application/json",
                        stringBytes(await update.originalNewCargoResponse.text())
                    )
                })
            ))

            if (
                update.oldManifestName.length > 0 
                && update.oldManifestName !== update.manifestName
            ) {
                filesToDelete.push(`${update.originalResolvedUrl}/${update.oldManifestName}`)
            }
            
            promises.push(this.putCargoIndex({
                name: update.newCargo?.name || "none",
                tag: update.tag,
                state: !resourcesToRequest ? CACHED : UPDATING,
                permissions: update.newCargo?.permissions || [],
                version: update.versions().new,
                entry: update.newCargo?.entry === NULL_FIELD
                    ? NULL_FIELD
                    : update.newCargo?.entry || NULL_FIELD,
                bytes: update.downloadMetadata().cargoTotalBytes,
                resolvedUrl: update.resolvedUrl,
                canonicalUrl: update.canonicalUrl,
                logo: update.newCargo?.crateLogoUrl || "",
                downloadId: downloadQueueId,
                manifestName: update.manifestName
            }))

            if (downloadQueueId === NO_UPDATE_QUEUED) {
                continue
            }

            downloadIndex.segments.push({
                name: update.newCargo?.name || "",
                map: createResourceMap(update.downloadableResources),
                version: update.versions().new,
                previousVersion: update.versions().old,
                resolvedUrl: update.resolvedUrl,
                canonicalUrl: update.canonicalUrl,
                bytes: update.downloadMetadata().bytesToDownload,
                resourcesToDelete: filesToDelete,
                downloadedResources: [],
                canRevertToPreviousVersion: false,
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
                return io.ok(STATUS_CODES.remoteResourceNotFound)
            }
            const {state} = cargoMeta
            if (state !== ABORTED && state !== FAILED) {
                return io.ok(STATUS_CODES.updateRetryImpossible)
            }
            const {resolvedUrl} = cargoMeta
            const errDownloadIndexRes = await getErrorDownloadIndex(
                resolvedUrl, this.virtualFileCache
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

        //const downloadsIndex = await this.getDownloadIndices()
        const removeFileUrls = []
        const requestFileUrls = []
        const downloadQueueId = provisionDownloadId()
        const retryDownloadIndex: DownloadIndex = {
            id: downloadQueueId,
            previousId: "",
            bytes: 0,
            segments: [] as DownloadSegment[],
            title,
            startedAt: Date.now()
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
                state: UPDATING, 
                downloadId: downloadQueueId
            })
        }
        const self = this
        await Promise.all([
            this.putDownloadIndex(retryDownloadIndex),
            ...removeFileUrls.map((url) => self.virtualFileCache.deleteFile(url))
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

    uninstallAllAssets(): Promise<unknown> {
        return Promise.all([
            this.fileCache.deleteAllFiles(),
            this.virtualFileCache.deleteAllFiles(),
            this.clientMessageChannel.deleteAllMessages(),
            this.backendMessageChannel.deleteAllMessages()
        ] as const)
    }

    async getCargoAtUrl(canonicalUrl: string) {
        const cargoIndex = await this.getCargoIndexByCanonicalUrl(canonicalUrl)
        if (!cargoIndex) {
            return io.err("not found")
        }
        const {resolvedUrl} = cargoIndex
        const cleanedRootUrl = addSlashToEnd(resolvedUrl)
        const manifestName = getFileNameFromUrl(canonicalUrl)
        const cargoUrl = `${cleanedRootUrl}${manifestName}`
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
            name: manifestName,
            pkg: new HuzmaManifest(cargoFileJson.data as HuzmaManifest),
            bytes: stringBytes(cargoFileText.data)
        })
    }

    getCachedFile(url: string) {
        return this.fileCache.getFile(url)
    }

    private async deleteAllCargoFiles(
        canonicalUrl: string, 
        resolvedUrl: string
    ): Promise<boolean> {
        const fullCargo = await this.getCargoAtUrl(canonicalUrl)
        if (!fullCargo.ok) {
            return false
        }
        const {pkg} = fullCargo.data
        // add to cargo.json to files so that it 
        // can be deleted along side it's files
        pkg.files.push({
            name: getFileNameFromUrl(canonicalUrl), 
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

    private async removeCargoFromDownloadQueue(canonicalUrl: string): Promise<StatusCode> {
        const targetIndex = await this.getDownloadIndexByCanonicalUrl(
            canonicalUrl
        )
        if (!targetIndex) {
            return STATUS_CODES.remoteResourceNotFound
        }
        const promises: Promise<unknown>[] = []
        if (targetIndex.segments.length < 2) {
            promises.push(
                this.deleteDownloadIndex(canonicalUrl),
                this.downloadManager.cancelDownload(targetIndex.id)
            )
        } else {
            promises.push(this.removeDownloadSegment(canonicalUrl))
        }
        await Promise.all(promises)
        return STATUS_CODES.ok
    }

    async deleteCargo(canonicalUrl: string): Promise<Ok<StatusCode>> {
        const cargoIndex = await this.getCargoIndexByCanonicalUrl(canonicalUrl)
        if (!cargoIndex) {
            return io.ok(STATUS_CODES.remoteResourceNotFound)
        }
        const promises = []
        promises.push(
            this.deleteAllCargoFiles(
                cargoIndex.canonicalUrl,
                cargoIndex.resolvedUrl
            )
        )
        if (
            cargoIndex.state === UPDATING
            && cargoIndex.downloadId !== NO_UPDATE_QUEUED
        ) {
            promises.push(this.removeCargoFromDownloadQueue(canonicalUrl))
        }

        const errorDownloadIndex = await getErrorDownloadIndex(cargoIndex.resolvedUrl, this.virtualFileCache)
        if (errorDownloadIndex) {
            promises.push(
                this.virtualFileCache.deleteFile(errorDownloadIndex.url)
            )
        }
        await Promise.all(promises)
        
        return io.ok(await this.deleteCargoIndex(cargoIndex.canonicalUrl))
    }

    async getCargoIndexByCanonicalUrl(canonicalUrl: string): Promise<ManifestIndex | null> {
        return await this.indexStorage.getIndex(canonicalUrl)
    }

    async putCargoIndex(newIndex: ManifestIndexWithoutMeta): Promise<StatusCode> {
        const previousIndex = await this.indexStorage.getIndex(newIndex.canonicalUrl)
        if (!previousIndex) {
            await this.indexStorage.putIndex({
                ...newIndex,
                created: Date.now(),
                updated: Date.now()
            })
            return STATUS_CODES.createNewIndex
        }
        await this.indexStorage.putIndex({
            ...previousIndex,
            ...newIndex,
            updated: Date.now()
        })
        return STATUS_CODES.updatedPreviousIndex
    }

    async deleteCargoIndex(canonicalUrl: string): Promise<StatusCode> {
        const targetIndex = await this.indexStorage.getIndex(canonicalUrl)
        if (!targetIndex) {
            return STATUS_CODES.remoteResourceNotFound
        }
        await this.indexStorage.deleteIndex(canonicalUrl)
        return STATUS_CODES.ok
    }

    // download index interfaces
    async getDownloadIndexByCanonicalUrl(
        canonicalUrl: string
    ): Promise<DownloadIndex | null> {
        const indexes = await this.backendMessageChannel.getAllMessages()
        const targetIndex = indexes.findIndex((index) => {
            const {segments} = index
            const targetIndex = segments.findIndex(
                (segment) => segment.canonicalUrl === canonicalUrl
            )
            return targetIndex > -1
        })
        if (targetIndex < 0) {
            return null
        }
        return indexes[targetIndex]
    }

    async putDownloadIndex(updatedIndex: DownloadIndex): Promise<boolean> {
        return this.backendMessageChannel.createMessage(updatedIndex)
    }

    private async removeDownloadSegment(canonicalUrl: string): Promise<Ok<StatusCode>> {
        const target = await this.getDownloadIndexByCanonicalUrl(
            canonicalUrl
        )
        if (!target) {
            return io.ok(STATUS_CODES.remoteResourceNotFound)
        }
        const segmentIndex = target.segments.findIndex(
            (segment) => segment.canonicalUrl === canonicalUrl 
        )
        if (segmentIndex < 0) {
            return io.ok(STATUS_CODES.downloadSegmentNotFound)
        }
        target.segments.splice(segmentIndex, 1)
        await this.putDownloadIndex(target)
        return io.ok(STATUS_CODES.ok)
    }

    async deleteDownloadIndex(canonicalUrl: string) {
        const target = await this.getDownloadIndexByCanonicalUrl(
            canonicalUrl
        )
        if (!target) {
            return io.ok(STATUS_CODES.remoteResourceNotFound)
        }
        await this.backendMessageChannel.deleteMessage(target.id)
        return io.ok(STATUS_CODES.ok)
    }

    // progress listening interfaces
    async getDownloadState(canonicalUrl: string): Promise<DownloadStateSummary | null> {
        const [cargoIndex, downloadIndex] = await Promise.all([
            this.getCargoIndexByCanonicalUrl(canonicalUrl),
            this.getDownloadIndexByCanonicalUrl(canonicalUrl)
        ] as const)
        if (!cargoIndex || !downloadIndex) {
            return null
        }
        if (cargoIndex.downloadId === NO_UPDATE_QUEUED) {
            return null
        }
        const managerResponse = await io.wrap(
            this.downloadManager.getDownloadState(cargoIndex.downloadId)
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

    async getDownloadStateById(downloadId: string): Promise<DownloadState | null> {
        const managerResponse = await io.wrap(
            this.downloadManager.getDownloadState(downloadId)
        )
        if (!managerResponse.ok || !managerResponse.data) {
            return null
        }
        return managerResponse.data
    }

    async consumeQueuedMessages(): Promise<StatusCode> {
        const {clientMessageChannel} = this
        const messages = await clientMessageChannel.getAllMessages()
        if (messages.length < 1) {
            return STATUS_CODES.noMessagesFound
        }

        const stateUpdateCount = messages.reduce(
            (total, next) => total + next.stateUpdates.length,
            0
        )
        let notFoundCount = 0

        for (const message of messages) {
            for (const update of message.stateUpdates) {
                const {canonicalUrl, state} = update
                const targetIndex = await this.getCargoIndexByCanonicalUrl(
                    canonicalUrl
                )
                if (!targetIndex) {
                    notFoundCount++
                    continue
                }
                await this.putCargoIndex({
                    ...targetIndex, 
                    state,
                    downloadId: NO_UPDATE_QUEUED
                })
            }
        }
        
        await Promise.all(
            messages.map((message) => clientMessageChannel.deleteMessage(message.downloadId))
        )

        if (notFoundCount === stateUpdateCount) {
            return STATUS_CODES.allMessagesAreOrphaned
        }

        if (notFoundCount > 0) {
            return STATUS_CODES.someMessagesAreOrphaned
        }
        return STATUS_CODES.messagesConsumed
    }

    async askToPersist(): Promise<boolean> {
        if (await this.fileCache.isPersisted()) {
            return false
        }
        return this.fileCache.requestPersistence()
    }
}