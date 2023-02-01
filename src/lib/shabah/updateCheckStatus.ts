import { ERROR_CODES_START, RequestableResource, StatusCode, STATUS_CODES } from "./client"
import {Cargo} from "../cargo"
import { NO_INSTALLATION } from "./utility"
import { DeepReadonly } from "../types/utility"
import {readableByteCount} from "../utils/storage/friendlyBytes"

type NewCargo = DeepReadonly<{
    response: Response
    text: string
    parsed: Cargo
    canonicalUrl: string
    resolvedUrl: string
}> | null

type UpdateMetadata = DeepReadonly<{
    id: string
    originalResolvedUrl: string
    resolvedUrl: string
    canonicalUrl: string
}>

type PreviousCargo = null | DeepReadonly<Cargo>

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
    metadata: UpdateMetadata
    errors: ReadonlyArray<string>
    newCargo: NewCargo
    previousCargo: PreviousCargo
    previousVersionExists: boolean
    download: DownloadMetadata
    diskInfo: DiskMetadata
    status?: StatusCode
}

export class UpdateCheckResponse {
    readonly metadata: UpdateMetadata
    readonly errors: ReadonlyArray<string>
    readonly newCargo: NewCargo
    readonly previousCargo: PreviousCargo
    readonly previousVersionExists: boolean
    private readonly _download: DownloadMetadata
    readonly diskInfo: DiskMetadata
    readonly status: StatusCode

    constructor(config: UpdateCheckConfig) {
        this.metadata = config.metadata
        this.errors = config.errors
        this.newCargo = config.newCargo
        this.previousCargo = config.previousCargo
        this.previousVersionExists = config.previousVersionExists
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
            this.newCargo?.parsed.version
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
        return this.newCargo.parsed.files.reduce(
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