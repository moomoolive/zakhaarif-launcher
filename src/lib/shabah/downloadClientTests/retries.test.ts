import { describe, it, expect } from "vitest"
import {Shabah} from "../downloadClient"
import {CACHED, CargoIndex, CargoState, DownloadSegment, FAILED, FileCache, getErrorDownloadIndex, NO_UPDATE_QUEUED, ResourceMap, saveErrorDownloadIndex, UPDATING} from "../backend"
import {DownloadManager} from "../backend"
import { Cargo} from "../../cargo"
import { Permissions } from "../../types/permissions"
import { cleanPermissions } from "../../utils/security/permissionsSummary"
import {UpdateCheckConfig, UpdateCheckResponse} from "../updateCheckStatus"

type FileHandlers = Record<string, () => (Response | null)>
type AccessLog = Readonly<{
    url: string
    time: number
    action: "get" | "put" | "delete"
}>

const addUrlToResponse = (response: Response, url: string) => {
    Object.defineProperty(response, "url", {value: url})
    return response
}

class MockCache {
    private cache = {} as FileHandlers
    readonly accessLog = [] as Array<AccessLog>

    constructor(initCache?: FileHandlers) {
        this.cache = initCache || {}
        this.accessLog = []
    }

    getFile(url: string) {
        this.accessLog.push({url, action: "get", time: Date.now()})
        const fileHandler = this.cache[url]
        if (!fileHandler) {
            return
        }
        const file = fileHandler()
        if (!file) {
            return
        }
        return addUrlToResponse(file.clone(), url)
    }

    putFile(url: string, response: Response) {
        this.accessLog.push({url, action: "put", time: Date.now()})
        this.cache[url] = () => response
    }

    deleteFile(url: string) {
        this.accessLog.push({url, action: "delete", time: Date.now()})
        this.cache[url] = () => null
    }

    deleteAll() {
        this.cache = {}
    }
}

const dependencies = ({
    cacheFiles = {} as FileHandlers,
    cacheQuota = {usage: 0, quota: 0},
    networkFiles = {} as FileHandlers,
    downloadManagerState = new Map<string, number>()
} = {}) => {
    
    const networkCache = new MockCache(networkFiles)
    const networkRequest: typeof fetch = async (input) => {
        const url = ((i: typeof input) => {
            return i instanceof URL 
                ? i.href
                : i instanceof Request ? i.url : i
        })(input)
        const response = networkCache.getFile(url)
        if (!response) {
            return addUrlToResponse(
                new Response("", {status: 404}),
                url
            )
        }
        const isRedirectStatus = (
            response.status > 299 
            && response.status < 400
        )
        const hasRedirectHeader = response.headers.has("location")
        if (!isRedirectStatus || !hasRedirectHeader) {
            return response
        }
        const redirectUrl = response.headers.get("location") || ""
        const redirectResponse = networkCache.getFile(redirectUrl)
        if (!redirectResponse) {
            return addUrlToResponse(
                new Response("", {status: 404}),
                redirectUrl
            )
        }
        return redirectResponse
    }

    const innerFileCache = new MockCache(cacheFiles)
    const fileCache: FileCache = {
        getFile: async (url) => {
            return innerFileCache.getFile(url) || null
        },
        putFile: async (url, response) => {
            innerFileCache.putFile(url, response)
            return true
        },
        queryUsage: async () => cacheQuota,
        deleteFile: async (url) => {
            innerFileCache.deleteFile(url)
            return true
        },
        deleteAllFiles: async () => {
            innerFileCache.deleteAll()
            return true
        },
        listFiles: async () => [],
        isPersisted: async () => true,
        requestPersistence: async () => true
    }

    const downloadState = {
        queuedDownloads: [] as Array<{
            id: string, urls: 
            string[], 
            options: {
                title: string
                downloadTotal: number
            }
        }>
    }

    const canceledDownloads = new Map<string, 1>()
    const queuedDownloads = new Map<string, number>()
    const downloadManager: DownloadManager = {
        queueDownload: async (id, urls, {title = "", downloadTotal}) => {
            queuedDownloads.set(id, 1)
            downloadState.queuedDownloads.push({
                id,
                urls,
                options: {title, downloadTotal}
            })
            return true
        },
        getDownloadState: async (id) => {
            const exists = queuedDownloads.has(id)
            if (!exists) {
                return null
            }
            const queueIndex = downloadState.queuedDownloads.findIndex(
                (download) => download.id === id
            )
            return {
                id,
                downloaded: 0,
                total: queueIndex < 0
                    ? 100
                    : downloadState.queuedDownloads[queueIndex].options.downloadTotal,
                failed: false,
                finished: false,
                failureReason: "none"
            }
        },
        cancelDownload: async (id) => {
            canceledDownloads.set(id, 1)
            return true
        },
        currentDownloadIds: async () => {
            return downloadState.queuedDownloads.map(
                (download) => download.id
            )
        }
    }

    return {
        adaptors: {networkRequest, fileCache, downloadManager},
        caches: {networkCache, innerFileCache},
        downloadState,
        canceledDownloads
    }
}

const cargoToCargoIndex = (
    canonicalUrl: string,
    cargo: Cargo<Permissions>, 
    {
        tag = 0,
        resolvedUrl,
        bytes = 0,
        state = CACHED,
        downloadId = NO_UPDATE_QUEUED
    }: Partial<{
        tag: number
        resolvedUrl: string
        bytes: number
        state: CargoState,
        downloadId: string
    }> = {}
) => {
    const index: CargoIndex = {
        tag,
        name: cargo.name,
        logo: cargo.crateLogoUrl,
        resolvedUrl: resolvedUrl || canonicalUrl,
        canonicalUrl,
        bytes,
        entry: cargo.entry,
        version: cargo.version,
        permissions: cargo.permissions,
        state,
        created: Date.now(),
        updated: Date.now(),
        downloadId: downloadId
    }
    return index
}

const mockCargo = new Cargo<Permissions>({
    name: "test",
    version: "0.1.0",
    schema: "0.1.0",
    files: [],
})

const createClient = (
    origin: string, 
    config?: Parameters<typeof dependencies>[0]
) => {
    const deps = dependencies(config)
    const {adaptors} = deps
    return {
        ...deps, 
        client: new Shabah({
            origin,
            adaptors, 
            permissionsCleaner: cleanPermissions
        })
    }
}

const createUpdateCheck = (config: Partial<UpdateCheckConfig>) => {
    const {
        status = Shabah.STATUS.ok,
        tag = 0,
        originalResolvedUrl = "",
        canonicalUrl = "",
        resolvedUrl = "",
        errors = [],
        newCargo = null,
        originalNewCargoResponse = new Response(),
        previousCargo = null,
        
        downloadableResources = [],
        resourcesToDelete = [],

        diskInfo = {used: 0, total: 0, left: 0},
    } = config
    return new UpdateCheckResponse({
        diskInfo,
        downloadableResources,
        resourcesToDelete,
        previousCargo,
        newCargo,
        originalNewCargoResponse,
        errors,
        tag,
        originalResolvedUrl,
        resolvedUrl,
        canonicalUrl,
        status,
    })
}

describe("download retries", () => {
    it("attempting to retry a download with an empty array does not queue a download", async () => {
        const mainOrigin = "https://yo-mama.com"
        const {client, downloadState} = createClient(mainOrigin, {
            cacheFiles: {},
            networkFiles: {},
        })
        expect(downloadState.queuedDownloads.length).toBe(0)
        const response = await client.retryFailedDownloads([], "none")
        expect(response.ok).toBe(true)
        expect(response.data).toBe(Shabah.STATUS.zeroUpdatesProvided)
        expect(downloadState.queuedDownloads.length).toBe(0)
    })

    it(`attempting to retry a non existent cargo should not queue a download`, async () => {
        const mainOrigin = "https://my-mamas-house.com"
        const origins = [
            "https://papashouse.com",
            "https://mamashouse.com"
        ] as const
        const testCases = [
            [
                {
                    storage: {used: 100, total: 20_000, left: 100},
                    downloadableResources: [
                        {requestUrl: `${origins[0]}/index.js`, storageUrl: `${origins[0]}/index.js`, bytes: 500}
                    ],
                    resourcesToDelete: [
                        {requestUrl: `${origins[0]}/delete1.js`, storageUrl: `${origins[0]}/delete1.js`, bytes: 500},
                    ],
                    origin: origins[0]
                },
                {
                    storage: {used: 100, total: 20_000, left: 1_900},
                    downloadableResources: [
                        {requestUrl: `${origins[1]}/index.js`, storageUrl: `${origins[1]}/index.js`, bytes: 500},
                        {requestUrl: `${origins[1]}/style.css`, storageUrl: `${origins[1]}/style.css`, bytes: 2_300},
                    ],
                    resourcesToDelete: [
                        {requestUrl: `${origins[1]}/delete1.js`, storageUrl: `${origins[1]}/delete1.js`, bytes: 500},
                        {requestUrl: `${origins[1]}/delete2.css`, storageUrl: `${origins[1]}/delete2.css`, bytes: 500},
                    ],
                    origin: origins[1]
                },
            ],
        ]
        for (const testCase of testCases) {
            const downloadClient = createClient(mainOrigin, {
                cacheFiles: {},
                networkFiles: {},
            })
            const {client, downloadState} = downloadClient

            for (const {origin} of testCase) {
                const canonicalUrl = origin + "/"
                expect(downloadState.queuedDownloads.length).toBe(0)
                const queueResponse = await client.retryFailedDownloads(
                    [canonicalUrl], "retry"
                )
                expect(queueResponse.ok).toBe(true)
                expect(queueResponse.data).toBe(Shabah.STATUS.remoteResourceNotFound)
                expect(downloadState.queuedDownloads.length).toBe(0)
            }
        }
    })

    it(`attempting to retry a cargo not in an error state should not queue a download`, async () => {
        const mainOrigin = "https://my-mamas-house.com"
        const origins = [
            "https://papashouse.com",
            "https://mamashouse.com"
        ] as const
        const testCases = [
            [
                {
                    storage: {used: 100, total: 20_000, left: 100},
                    downloadableResources: [
                        {requestUrl: `${origins[0]}/index.js`, storageUrl: `${origins[0]}/index.js`, bytes: 500}
                    ],
                    resourcesToDelete: [
                        {requestUrl: `${origins[0]}/delete1.js`, storageUrl: `${origins[0]}/delete1.js`, bytes: 500},
                    ],
                    origin: origins[0]
                },
                {
                    storage: {used: 100, total: 20_000, left: 1_900},
                    downloadableResources: [
                        {requestUrl: `${origins[1]}/index.js`, storageUrl: `${origins[1]}/index.js`, bytes: 500},
                        {requestUrl: `${origins[1]}/style.css`, storageUrl: `${origins[1]}/style.css`, bytes: 2_300},
                    ],
                    resourcesToDelete: [
                        {requestUrl: `${origins[1]}/delete1.js`, storageUrl: `${origins[1]}/delete1.js`, bytes: 500},
                        {requestUrl: `${origins[1]}/delete2.css`, storageUrl: `${origins[1]}/delete2.css`, bytes: 500},
                    ],
                    origin: origins[1]
                },
            ],
        ]
        for (const testCase of testCases) {
            const downloadClient = createClient(mainOrigin, {
                cacheFiles: {},
                networkFiles: {},
            })
            const {client, downloadState} = downloadClient
            for (const {origin} of testCase) {
                const canonicalUrl = origin + "/"
                const cargo = new Cargo({
                    name: origin + "-cargo"
                })
                const cargoIndex = cargoToCargoIndex(
                    canonicalUrl,
                    cargo as Cargo<Permissions>
                )
                await client.putCargoIndex(cargoIndex)
                const cargoIndexFound = await client.getCargoIndexByCanonicalUrl(
                    canonicalUrl
                )
                expect(!!cargoIndexFound).toBe(true)
                expect(cargoIndexFound?.state).toBe(CACHED)
                expect(downloadState.queuedDownloads.length).toBe(0)
                const queueResponse = await client.retryFailedDownloads(
                    [canonicalUrl], "retry"
                )
                expect(queueResponse.ok).toBe(true)
                expect(queueResponse.data).toBe(Shabah.STATUS.updateRetryImpossible)
                expect(downloadState.queuedDownloads.length).toBe(0)
            }
        }
    })

    it(`attempting to retry a cargo in an error state but has not error download index, should not queue a download`, async () => {
        const mainOrigin = "https://my-mamas-house.com"
        const origins = [
            "https://papashouse.com",
            "https://mamashouse.com"
        ] as const
        const testCases = [
            [
                {
                    storage: {used: 100, total: 20_000, left: 100},
                    downloadableResources: [
                        {requestUrl: `${origins[0]}/index.js`, storageUrl: `${origins[0]}/index.js`, bytes: 500}
                    ],
                    resourcesToDelete: [
                        {requestUrl: `${origins[0]}/delete1.js`, storageUrl: `${origins[0]}/delete1.js`, bytes: 500},
                    ],
                    origin: origins[0]
                },
                {
                    storage: {used: 100, total: 20_000, left: 1_900},
                    downloadableResources: [
                        {requestUrl: `${origins[1]}/index.js`, storageUrl: `${origins[1]}/index.js`, bytes: 500},
                        {requestUrl: `${origins[1]}/style.css`, storageUrl: `${origins[1]}/style.css`, bytes: 2_300},
                    ],
                    resourcesToDelete: [
                        {requestUrl: `${origins[1]}/delete1.js`, storageUrl: `${origins[1]}/delete1.js`, bytes: 500},
                        {requestUrl: `${origins[1]}/delete2.css`, storageUrl: `${origins[1]}/delete2.css`, bytes: 500},
                    ],
                    origin: origins[1]
                },
            ],
        ]
        for (const testCase of testCases) {
            const downloadClient = createClient(mainOrigin, {
                cacheFiles: {},
                networkFiles: {},
            })
            const {client, downloadState} = downloadClient
            for (const {origin} of testCase) {
                const canonicalUrl = origin + "/"
                const cargo = new Cargo({
                    name: origin + "-cargo"
                })
                const cargoIndex = cargoToCargoIndex(
                    canonicalUrl,
                    cargo as Cargo<Permissions>,
                    {state: FAILED}
                )
                await client.putCargoIndex(cargoIndex)
                const cargoIndexFound = await client.getCargoIndexByCanonicalUrl(
                    canonicalUrl
                )
                expect(!!cargoIndexFound).toBe(true)
                expect(cargoIndexFound?.state).toBe(FAILED)
                expect(downloadState.queuedDownloads.length).toBe(0)
                const queueResponse = await client.retryFailedDownloads(
                    [canonicalUrl], "retry"
                )
                expect(queueResponse.ok).toBe(true)
                expect(queueResponse.data).toBe(Shabah.STATUS.errorIndexNotFound)
                expect(downloadState.queuedDownloads.length).toBe(0)
            }
        }
    })

    it(`attempting to retry a cargo in an error state that has a error download index, should queue a download`, async () => {
        const mainOrigin = "https://my-mamas-house.com"
        const origins = [
            "https://papashouse.com",
            "https://mamashouse.com"
        ] as const
        const testCases = [
            [
                {
                    storage: {used: 100, total: 20_000, left: 100},
                    downloadableResources: [
                        {requestUrl: `${origins[0]}/index.js`, storageUrl: `${origins[0]}/index.js`, bytes: 500}
                    ],
                    resourcesToDelete: [
                        {requestUrl: `${origins[0]}/delete1.js`, storageUrl: `${origins[0]}/delete1.js`, bytes: 500},
                    ],
                    origin: origins[0]
                },
            ],
            [
                {
                    storage: {used: 100, total: 20_000, left: 1_900},
                    downloadableResources: [
                        {requestUrl: `${origins[1]}/index.js`, storageUrl: `${origins[1]}/index.js`, bytes: 500},
                        {requestUrl: `${origins[1]}/style.css`, storageUrl: `${origins[1]}/style.css`, bytes: 2_300},
                    ],
                    resourcesToDelete: [
                        {requestUrl: `${origins[1]}/delete1.js`, storageUrl: `${origins[1]}/delete1.js`, bytes: 500},
                        {requestUrl: `${origins[1]}/delete2.css`, storageUrl: `${origins[1]}/delete2.css`, bytes: 500},
                    ],
                    origin: origins[1]
                },
            ]
        ]
        for (const testCase of testCases) {
            const downloadClient = createClient(mainOrigin, {
                cacheFiles: {},
                networkFiles: {},
            })
            const {client, downloadState, adaptors} = downloadClient
            for (const {origin} of testCase) {
                const canonicalUrl = origin + "/"
                const resolvedUrl = canonicalUrl
                const files = ["index.js", "style.css"].map(
                    (extension) => resolvedUrl + extension
                )
                const resourceMap = files.reduce((total, next) => {
                    total[next] = {
                        bytes: 0,
                        mime: "text/plain",
                        statusText: "NOT FOUND",
                        status: 404,
                        storageUrl: next
                    }
                    return total
                }, {} as ResourceMap)
                const errorDownloadIndex = {
                    id: "tmp",
                    previousId: "",
                    title: "none",
                    startedAt: Date.now(),
                    bytes: 0,
                    segments: [
                        {
                            resolvedUrl,
                            canonicalUrl,
                            map: resourceMap,
                            bytes: 0,
                            version: "0.2.0",
                            previousVersion: "0.1.0"
                        }
                    ] as DownloadSegment[]
                }
                await saveErrorDownloadIndex(
                    resolvedUrl, 
                    errorDownloadIndex, 
                    adaptors.fileCache
                )
                const errorIndex = await getErrorDownloadIndex(
                    resolvedUrl, adaptors.fileCache
                )
                expect(!!errorIndex).toBe(true)
                const cargo = new Cargo({
                    name: origin + "-cargo"
                })
                const cargoIndex = cargoToCargoIndex(
                    canonicalUrl,
                    cargo as Cargo<Permissions>,
                    {state: FAILED}
                )
                await client.putCargoIndex(cargoIndex)
                const cargoIndexFound = await client.getCargoIndexByCanonicalUrl(
                    canonicalUrl
                )
                expect(!!cargoIndexFound).toBe(true)
                expect(cargoIndexFound?.state).toBe(FAILED)
                const queueResponse = await client.retryFailedDownloads(
                    [canonicalUrl], "retry"
                )
                expect(queueResponse.ok).toBe(true)
                expect(queueResponse.data).toBe(Shabah.STATUS.updateRetryQueued)
                expect(downloadState.queuedDownloads.length).toBe(1)
                for (const url of files) {
                    const queued = downloadState.queuedDownloads[0].urls
                    const found = queued.find((queuedUrl) => queuedUrl === url)
                    expect(!!found).toBe(true)
                }
                const cargoIndexFoundAfterMutation = await client.getCargoIndexByCanonicalUrl(
                    canonicalUrl
                )
                expect(!!cargoIndexFoundAfterMutation).toBe(true)
                expect(cargoIndexFoundAfterMutation?.state).toBe(UPDATING)
                expect(cargoIndexFoundAfterMutation?.downloadId).toBe(downloadState.queuedDownloads[0].id)
                const errorIndexAfterMutation = await getErrorDownloadIndex(
                    resolvedUrl, adaptors.fileCache
                )
                expect(!!errorIndexAfterMutation).toBe(false)
            }
        }
    })

    it(`can retry multiple failed downloads at once`, async () => {
        const mainOrigin = "https://my-mamas-house.com"
        const testCases = [
            [
                {origin: "https://papashouse.com"},
                {origin: "https://cookie-monstar.com"},
                {origin: "https://my-cookies.com"},
            ],
            [
                {origin: "https://jsdownload.com"},
                {origin: "https://js_er.com"},
            ]
        ]
        for (const testCase of testCases) {
            const downloadClient = createClient(mainOrigin, {
                cacheFiles: {},
                networkFiles: {},
            })
            const {client, downloadState, adaptors} = downloadClient
            const queuedDownloads = []
            for (const {origin} of testCase) {
                const canonicalUrl = origin + "/"
                const resolvedUrl = canonicalUrl
                const files = ["index.js", "style.css"].map(
                    (extension) => resolvedUrl + extension
                )
                queuedDownloads.push({
                    origin,
                    resolvedUrl,
                    canonicalUrl,
                    files
                })
                const resourceMap = files.reduce((total, next) => {
                    total[next] = {
                        bytes: 0,
                        mime: "text/plain",
                        statusText: "NOT FOUND",
                        status: 404,
                        storageUrl: next
                    }
                    return total
                }, {} as ResourceMap)
                const errorDownloadIndex = {
                    id: "tmp",
                    previousId: "",
                    title: "none",
                    startedAt: Date.now(),
                    bytes: 0,
                    segments: [
                        {
                            resolvedUrl,
                            canonicalUrl,
                            map: resourceMap,
                            bytes: 0,
                            version: "0.2.0",
                            previousVersion: "0.1.0"
                        }
                    ] as DownloadSegment[]
                }
                await saveErrorDownloadIndex(
                    resolvedUrl, 
                    errorDownloadIndex, 
                    adaptors.fileCache
                )
                const errorIndex = await getErrorDownloadIndex(
                    resolvedUrl, adaptors.fileCache
                )
                expect(!!errorIndex).toBe(true)
                const cargo = new Cargo({
                    name: origin + "-cargo"
                })
                const cargoIndex = cargoToCargoIndex(
                    canonicalUrl,
                    cargo as Cargo<Permissions>,
                    {state: FAILED}
                )
                await client.putCargoIndex(cargoIndex)
                const cargoIndexFound = await client.getCargoIndexByCanonicalUrl(
                    canonicalUrl
                )
                expect(!!cargoIndexFound).toBe(true)
                expect(cargoIndexFound?.state).toBe(FAILED)
            }

            const canonicalUrls = testCase.map((test) => test.origin + "/")
            const queueResponse = await client.retryFailedDownloads(
                canonicalUrls, "retry"
            )
            expect(queueResponse.ok).toBe(true)
            expect(queueResponse.data).toBe(Shabah.STATUS.updateRetryQueued)
            expect(downloadState.queuedDownloads.length).toBe(1)
            
            for (const {canonicalUrl, resolvedUrl, files} of queuedDownloads) {
                for (const url of files) {
                    const queued = downloadState.queuedDownloads[0].urls
                    const found = queued.find((queuedUrl) => queuedUrl === url)
                    expect(!!found).toBe(true)
                    const cargoIndexFoundAfterMutation = await client.getCargoIndexByCanonicalUrl(
                        canonicalUrl
                    )
                    expect(!!cargoIndexFoundAfterMutation).toBe(true)
                    expect(cargoIndexFoundAfterMutation?.state).toBe(UPDATING)
                    expect(cargoIndexFoundAfterMutation?.downloadId).toBe(downloadState.queuedDownloads[0].id)
                    const errorIndexAfterMutation = await getErrorDownloadIndex(
                        resolvedUrl, adaptors.fileCache
                    )
                    expect(!!errorIndexAfterMutation).toBe(false)
                }
            }
            
        }
    })
})
