import { ERROR_CODES_START, RequestableResource, StatusCode, STATUS_CODES } from "./client"
import {Cargo} from "../cargo"
import { NO_INSTALLATION } from "./utility"
import { DeepReadonly } from "../types/utility"
import {readableByteCount} from "../utils/storage/friendlyBytes"

type DownloadMetadata = DeepReadonly<{
    downloadableResources: RequestableResource[]
    resourcesToDelete: RequestableResource[]
}>

type DiskMetadata = DeepReadonly<{
    raw: {
        used: number
        total: number
        left: number
    }
    cargoStorageBytes: number
}>

export type UpdateCheckConfig = {
    id: string
    originalResolvedUrl: string
    resolvedUrl: string
    canonicalUrl: string
    errors: ReadonlyArray<string>
    newCargo: DeepReadonly<Cargo> | null
    originalNewCargoResponse: Response
    previousCargo: DeepReadonly<Cargo> | null
    download: DownloadMetadata
    diskInfo: DiskMetadata
    status?: StatusCode
}

export class UpdateCheckResponse {
    readonly id: string
    readonly originalResolvedUrl: string
    readonly resolvedUrl: string
    readonly canonicalUrl: string
    readonly newCargo: DeepReadonly<Cargo> | null
    readonly originalNewCargoResponse: Response
    readonly errors: ReadonlyArray<string>
    readonly previousCargo: DeepReadonly<Cargo> | null
    readonly diskInfo: DiskMetadata
    readonly status: StatusCode

    private readonly _download: DownloadMetadata

    constructor(config: UpdateCheckConfig) {
        this.id = config.id
        this.canonicalUrl = config.canonicalUrl
        this.resolvedUrl = config.resolvedUrl
        this.originalResolvedUrl = config.originalResolvedUrl
        this.errors = config.errors
        this.newCargo = config.newCargo
        this.originalNewCargoResponse = config.originalNewCargoResponse
        this.previousCargo = config.previousCargo
        this._download = config.download
        this.diskInfo = config.diskInfo
        this.status = config.status || STATUS_CODES.ok
    }

    errorOccurred() {
        return this.status >= ERROR_CODES_START || this.errors.length > 0
    }

    updateAvailable() {
        return !!this.newCargo
    }

    previousVersionExists() {
        return !!this.previousCargo
    }

    enoughStorageForCargo() {
        const totalStorage = this.diskInfo.raw.total
        if (totalStorage < 1) {
            return false
        }
        return totalStorage > this.diskWithCargo()
    }

    versions() {
        const oldVersion = (
            this.previousCargo?.version 
            || NO_INSTALLATION
        )
        const newVersion = (
            this.newCargo?.version
            || NO_INSTALLATION
        )
        return {new: newVersion, old: oldVersion}
    }

    bytesNeeded() {
        const totalStorage = this.diskInfo.raw.total
        return Math.max(
            0, (this.diskWithCargo() - totalStorage)
        )
    }

    private diskWithCargo() {
        const totalStorage = this.diskInfo.raw.used
        return totalStorage + this.bytesToDownload()
    }

    readableBytesNeeded() {
        const bytesNeededToDownload = this.bytesNeeded()
        const friendlyBytes = readableByteCount(bytesNeededToDownload)
        return `${friendlyBytes.count} ${friendlyBytes.metric.toUpperCase()}`
    }

    bytesToDownload() {
        const filesToDownload = this._download.downloadableResources
        return filesToDownload.reduce(
            (total, next) => total + next.bytes,
            0
        )
    }

    bytesToRemove() {
        const filesToDelete = this._download.resourcesToDelete
        return filesToDelete.reduce(
            (total, file) => total + file.bytes,
            0
        )
    }

    cargoTotalBytes() {
        if (!this.newCargo) {
            return 0
        }
        return this.newCargo.files.reduce(
            (total, next) => total + next.bytes,
            0
        )
    }

    downloadMetadata() {
        return {
            cargoTotalBytes: this.cargoTotalBytes(),
            bytesToDownload: this.bytesToDownload(),
            downloadableResources: this._download.downloadableResources,
            resourcesToDelete: this._download.resourcesToDelete,
            bytesToDelete: this.bytesToRemove()
        }
    }
}