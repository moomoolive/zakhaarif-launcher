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
    downloadIncidesUrl, 
    cargoIndicesUrl,
    FetchFunction,
    getDownloadIndices,
    updateDownloadIndex,
    FileCache,
    stringBytes
} from "./shared"

const enum bytes {
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
}

const roundDecimal = (num: number, decimals: number) => {
    const factor = 10 ** decimals
    return Math.round(num * factor) / factor
}

type UpdateDetails = Awaited<ReturnType<Shabah["checkForCargoUpdates"]>>

export class Shabah {
    static readonly NO_PREVIOUS_INSTALLATION = "none"

    static readonly statuses = {
        updateError: 0,
        updateNotEnoughDiskSpace: 1,
        updateNotAvailable: 2,
        updateQueued: 3,
        sameUpdateInProgress: 4
    } as const

    fetchFile: FetchFunction
    fileCache: FileCache
    queueUpdate: Function
    readonly origin: string

    private cargoIndicesCache: null | CargoIndices

    constructor({
        fetchFile,
        fileCache,
        origin
    }: ShabahOptions) {
        this.fetchFile = fetchFile
        this.fileCache = fileCache
        this.queueUpdate = () => {
            console.log("update queued")
        }
        this.origin = origin.endsWith("/")
            ? origin.slice(0, -1)
            : origin
        this.cargoIndicesCache = null
    }

    async diskInfo() {
        const diskusage = await this.fileCache.queryUsage()
        const used = diskusage.usage
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

    private async getDownloadIndices() {
        const {origin, fileCache} = this
        const url = downloadIncidesUrl(origin)
        return await getDownloadIndices(url, fileCache)
    }

    private async persistDownloadIndices(indices: DownloadIndexCollection) {
        const {origin, fileCache} = this
        return await saveDownloadIndices(indices, origin, fileCache)
    }

    async updateState(updateId: string) {
        const downloadsIndex = await this.getDownloadIndices()
        const updateIndex = downloadsIndex.downloads.findIndex((index) => {
            return index.id === updateId
        })
        if (updateIndex < 0) {
            return {
                updating: false, 
                updateVersion: "none",
                previousVersion: "none"
            }
        }
        const targetUpdate =  downloadsIndex.downloads[updateIndex]
        return {
            updating: true,
            updateVersion: targetUpdate.version,
            previousVersion: targetUpdate.previousVersion
        }
    }

    private async getCargoIndices() {
        if (this.cargoIndicesCache) {
            return this.cargoIndicesCache
        }
        const {origin, fileCache} = this
        const url = cargoIndicesUrl(origin)
        const cargos = await getCargoIndices(url, fileCache)
        this.cargoIndicesCache = cargos
        return cargos
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
        updateTitle: string
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
        const updateIndex = {
            id: details.id,
            bytes: details.updateCheckResponse.totalBytes,
            map: createResourceMap(
                details.updateCheckResponse.downloadableResources
            ),
            version: details.versions.new,
            previousVersion: details.versions.old,
            title: updateTitle
        }
        updateDownloadIndex(downloadsIndex, updateIndex)
        this.queueUpdate()
        await this.persistDownloadIndices(downloadsIndex)
        // save cargo manifest
        const newCargo = details.updateCheckResponse.newCargo!
        await this.fileCache.putFile(
            newCargo.storageUrl, 
            new Response(newCargo.text, {
                status: 200,
                statusText: "OK",
                headers: headers(
                    "application/json", 
                    stringBytes(newCargo.text)
                )
            })
        )
        await this.putCargoIndex(
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
}