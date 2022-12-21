import {checkForUpdates, FetchFunction} from "./client"
import {io, ResultType, Result} from "../monads/result"

const enum bytes {
    bytes_per_kb = 1_024,
    bytes_per_mb = 1_000 * bytes_per_kb,
    bytes_per_gb = 1_000 * bytes_per_mb
}

const SYSTEM_RESERVED_BYTES = 200 * bytes.bytes_per_mb

type CargoIndex = {
    storageUrl: string
    requestUrl: string
    category: number
    entry: string
    name: string
    id: string,
    bytes: number
}

const fetchRetry: FetchFunction = (input, init) => {
    return io.retry(
        () => fetch(input, init), 
        init.retryCount || 1
    )
}

const getDiskUsage = async () => {
    const {quota = 0, usage = 0} = await navigator.storage.estimate()
    return {quota, usage}
}

const DISK_CLEAR_MULTIPLIER = 3

type ShabahOptions = {
    fetchFile?: FetchFunction
    getCacheFile: FetchFunction,
    mutateCacheFile: (url: string, file: Response) => Promise<ResultType<void>>
    queryDiskUsage?: () => Promise<{quota: number, usage: number}>
}

const roundDecimal = (num: number, decimals: number) => {
    const factor = 10 ** decimals
    return Math.round(num * factor) / factor
}

export class Shabah {
    static cacheRequester(targetCache: string) {
        const notFound = new Response("", {
            status: 404,
            statusText: "NOT FOUND"
        })
        const getCacheFile: FetchFunction = async (input) => {
            const cache = await caches.open(targetCache)
            const file = await cache.match(input)
            if (file) {
                return io.ok(file)
            }
            return io.ok(notFound)
        }
        return getCacheFile
    }

    static cacheMutator(targetCache: string) {
        return async (url: string, file: Response) => {
            const cache = await caches.open(targetCache)
            return io.wrap(cache.put(url, file))
        }
    }

    downloadedCargos: CargoIndex[]
    fetchFile: FetchFunction
    getCacheFile: FetchFunction
    mutateCacheFile: (url: string, file: Response) => Promise<ResultType<void>>
    queryDiskUsage: NonNullable<ShabahOptions["queryDiskUsage"]>

    constructor({
        fetchFile = fetchRetry,
        queryDiskUsage = getDiskUsage,

        // required options
        getCacheFile,
        mutateCacheFile,
    }: ShabahOptions) {
        this.downloadedCargos = []
        this.fetchFile = fetchFile
        this.queryDiskUsage = queryDiskUsage
        this.getCacheFile = getCacheFile
        this.mutateCacheFile = mutateCacheFile
    }

    async diskInfo() {
        const diskusage = await this.queryDiskUsage()
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
        const {fetchFile, getCacheFile} = this
        const response = await checkForUpdates({
            requestRootUrl: cargo.requestUrl,
            storageRootUrl: cargo.storageUrl,
            name: cargo.name
        }, fetchFile, getCacheFile)
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
        return {
            updateCheckResponse: response,
            errorOccurred: response.errors.length > 0,
            enoughSpaceForPackage,
            updateAvailable: response.newCargos.length > 0,
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
            }
        }  
    }
}