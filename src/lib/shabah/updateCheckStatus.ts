import { ERROR_CODES_START, RequestableResource, StatusCode, STATUS_CODES } from "./client"
import {Cargo} from "../cargo"
import { NO_INSTALLATION } from "./utility"
import { DeepReadonly } from "../types/utility"
import {readableByteCount} from "../utils/storage/friendlyBytes"
import {debugStatusCode, DebugStatusName} from "./debug"

type RawDiskMetadata = Readonly<{
    used: number
    total: number
    left: number
}>

export type UpdateCheckConfig = {
    tag: number
    originalResolvedUrl: string
    resolvedUrl: string
    canonicalUrl: string
    errors: ReadonlyArray<string>
    newCargo: DeepReadonly<Cargo> | null
    originalNewCargoResponse: Response
    previousCargo: DeepReadonly<Cargo> | null
    downloadableResources: ReadonlyArray<RequestableResource>
    resourcesToDelete: ReadonlyArray<RequestableResource>
    diskInfo: RawDiskMetadata
    status?: StatusCode
}

export class UpdateCheckResponse {
    static enoughStorageForAllUpdates(updates: UpdateCheckResponse[]): boolean {
        if (updates.length < 1) {
            return true
        }

        const updateBytes = updates.reduce(
            (total, next) => total + next.bytesToDownload(),
            0
        )
        const deleteBytes = updates.reduce(
            (total, next) => total + next.bytesToRemove(),
            0
        )
        const diskInfo = updates[0].diskInfo
        const difference = updateBytes - deleteBytes
        const bytesAfterAllUpdates = diskInfo.used + difference
        const normalized = Math.max(0, bytesAfterAllUpdates)
        return normalized <= diskInfo.total
    }

    tag: number
    readonly originalResolvedUrl: string
    readonly resolvedUrl: string
    readonly canonicalUrl: string
    readonly newCargo: DeepReadonly<Cargo> | null
    readonly originalNewCargoResponse: Response
    readonly errors: ReadonlyArray<string>
    readonly previousCargo: DeepReadonly<Cargo> | null
    readonly status: StatusCode
    readonly statusText: DebugStatusName
    readonly downloadableResources: ReadonlyArray<RequestableResource>
    readonly resourcesToDelete: ReadonlyArray<RequestableResource>
    
    private readonly diskInfo: RawDiskMetadata

    constructor(config: UpdateCheckConfig) {
        this.tag = config.tag
        this.canonicalUrl = config.canonicalUrl
        this.resolvedUrl = config.resolvedUrl
        this.originalResolvedUrl = config.originalResolvedUrl
        this.errors = config.errors
        this.newCargo = config.newCargo
        this.originalNewCargoResponse = config.originalNewCargoResponse
        this.previousCargo = config.previousCargo
        this.downloadableResources = config.downloadableResources
        this.resourcesToDelete = config.resourcesToDelete
        this.diskInfo = config.diskInfo
        this.status = config.status || STATUS_CODES.ok
        this.statusText = debugStatusCode(this.status)
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
        const totalStorage = this.diskInfo.total
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
        const totalStorage = this.diskInfo.total
        return Math.max(
            0, (this.diskWithCargo() - totalStorage)
        )
    }

    private diskWithCargo() {
        const totalStorage = this.diskInfo.used
        return totalStorage + this.bytesToDownload()
    }

    readableBytesNeeded() {
        const bytesNeededToDownload = this.bytesNeeded()
        const friendlyBytes = readableByteCount(bytesNeededToDownload)
        return `${friendlyBytes.count} ${friendlyBytes.metric.toUpperCase()}`
    }

    bytesToDownload(): number {
        return this.downloadableResources.reduce(
            (total, next) => total + next.bytes,
            0
        )
    }

    bytesToRemove(): number {
        return this.resourcesToDelete.reduce(
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
            downloadableResources: this.downloadableResources,
            resourcesToDelete: this.resourcesToDelete,
            bytesToDelete: this.bytesToRemove()
        }
    }
}