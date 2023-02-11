import { describe, it, expect } from "vitest"
import {Shabah} from "../downloadClient"
import {
    CargoIndex, 
    CargoState, 
    FileCache, 
    NO_UPDATE_QUEUED,
    DownloadManager,
    CACHED,
    UPDATING
} from "../backend"
import {Cargo, MANIFEST_FILE_SUFFIX} from "../../cargo/index"
import { Permissions } from "../../types/permissions"
import { cleanPermissions } from "../../utils/security/permissionsSummary"
import { UpdateCheckResponse, UpdateCheckConfig } from "../updateCheckStatus"

const MANIFEST_NAME = "stable" + MANIFEST_FILE_SUFFIX

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


describe("reading and updating cargo indexes", () => {
    it("cargo index can be created", async () => {
        const canonicalUrl = "https://mymamashouse.com"
        const {client} = createClient(canonicalUrl)
        const cargo = new Cargo<Permissions>({name: "my-cargo"})
        const index = cargoToCargoIndex(canonicalUrl, cargo)
        await client.putCargoIndex(
            index,
        )
        const found = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!found).toBe(true)
    })

    it("calling put on an already existent index overwrites it", async () => {
        const canonicalUrl = "https://mymamashouse.com"
        const {client} = createClient(canonicalUrl)
        const initial = new Cargo<Permissions>({name: "my-cargo"})
        const index = cargoToCargoIndex(canonicalUrl, initial)
        await client.putCargoIndex(
            index,
        )
        const foundInitial = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(foundInitial?.name).toBe(initial.name)
        const updated =  cargoToCargoIndex(canonicalUrl, new Cargo({name: "cargo"}))
        await client.putCargoIndex(
            updated,
        )
        const foundUpdated = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(foundUpdated?.name).toBe(updated.name)
    })

    it("cargo indexes can be deleted", async () => {
        const canonicalUrl = "https://mymamashouse.com"
        const {client} = createClient(canonicalUrl)
        const initial = new Cargo<Permissions>({name: "my-cargo"})
        const index = cargoToCargoIndex(canonicalUrl, initial)
        await client.putCargoIndex(
            index,
        )
        const foundInitial = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!foundInitial).toBe(true)
        const deleteReponse = await client.deleteCargoIndex(canonicalUrl)
        expect(deleteReponse).toBe(Shabah.STATUS.ok)
        const afterDelete = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(afterDelete).toBe(null)
    })

    it("if cancel is called on cargo during update and cargo is only segement being update, download should be canceled", async () => {
        const origin = "https://mymamashouse.com"
        const canonicalUrl = origin + "/"
        const resolvedUrl = canonicalUrl
        const {client, canceledDownloads} = createClient(canonicalUrl)
        const initial = new Cargo<Permissions>({name: "my-cargo"})
        const updateResponse = createUpdateCheck({
            tag: 0,
            canonicalUrl,
            resolvedUrl,
            originalResolvedUrl: resolvedUrl,
            newCargo: initial,
            status: Shabah.STATUS.ok,
            diskInfo: {
                used: 0,
                total: 10_000,
                left: 10_000,
            },
            downloadableResources: [
                {requestUrl: `${resolvedUrl}/index.js`, storageUrl: `${resolvedUrl}/index.js`, bytes: 10}
            ],
        })
        await client.executeUpdates([updateResponse], "update")
        const foundInitial = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!foundInitial).toBe(true)
        expect(foundInitial?.downloadId).not.toBe(NO_UPDATE_QUEUED)
        expect(foundInitial?.state).toBe(UPDATING)
        
        const foundInitialDownload = await client.getDownloadIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!foundInitialDownload).toBe(true)
        const downloadId = foundInitialDownload?.id || "none"
        expect(foundInitialDownload?.segments.length).toBe(1)
        const deleteReponse = await client.deleteCargo(canonicalUrl)
        expect(deleteReponse.ok).toBe(true)
        expect(deleteReponse.data).toBe(Shabah.STATUS.ok)
        expect(canceledDownloads.has(downloadId)).toBe(true)
        const afterDelete = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(afterDelete).toBe(null)
        const foundDeleteDownload = await client.getDownloadIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!foundDeleteDownload).toBe(false)
    })

    it("if cancel is called on cargo during update and cargo is one of many segements being updated, download should be not be canceled and segment should be yanked from download", async () => {
        const origin = "https://mymamashouse.com"
        const canonicalUrl = origin + "/"
        const resolvedUrl = canonicalUrl
        const secondOrigin = "https://mydadashouse.com"
        const secondCanonicalUrl = secondOrigin + "/"
        const {client, canceledDownloads} = createClient(canonicalUrl)
        const initial = new Cargo<Permissions>({name: "my-cargo"})
        const updateResponse = createUpdateCheck({
            tag: 0,
            canonicalUrl,
            resolvedUrl,
            originalResolvedUrl: resolvedUrl,
            newCargo: initial,
            status: Shabah.STATUS.ok,
            diskInfo: {
                used: 0,
                total: 10_000,
                left: 10_000,
            },
            downloadableResources: [
                {requestUrl: `${resolvedUrl}/index.js`, storageUrl: `${resolvedUrl}/index.js`, bytes: 10}
            ],
        })
        const secondUpdate = createUpdateCheck({
            tag: 0,
            canonicalUrl: secondCanonicalUrl,
            resolvedUrl: secondCanonicalUrl,
            originalResolvedUrl: secondCanonicalUrl,
            newCargo: initial,
            status: Shabah.STATUS.ok,
            downloadableResources: [
                {requestUrl: `${secondCanonicalUrl}/index.js`, storageUrl: `${secondCanonicalUrl}/index.js`, bytes: 10}
            ],
            diskInfo: {
                used: 0,
                total: 10_000,
                left: 10_000,
            },
        })
        await client.executeUpdates(
            [updateResponse, secondUpdate], "update"
        )
        const foundInitial = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!foundInitial).toBe(true)
        expect(foundInitial?.downloadId).not.toBe(NO_UPDATE_QUEUED)
        expect(foundInitial?.state).toBe(UPDATING)

        const foundInitialSecond = await client.getCargoIndexByCanonicalUrl(
            secondCanonicalUrl
        )
        expect(!!foundInitialSecond).toBe(true)
        expect(foundInitialSecond?.downloadId || "none2").toBe(foundInitial?.downloadId || "none1")
        expect(foundInitialSecond?.state).toBe(UPDATING)

        const foundInitialDownload = await client.getDownloadIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!foundInitialDownload).toBe(true)
        expect(foundInitialDownload?.segments.length).toBe(2)
        const deleteReponse = await client.deleteCargo(canonicalUrl)
        expect(deleteReponse.ok).toBe(true)
        expect(deleteReponse.data).toBe(Shabah.STATUS.ok)
        const downloadId = foundInitialDownload?.id || "none"
        expect(canceledDownloads.has(downloadId)).toBe(false)
        const afterDelete = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(afterDelete).toBe(null)
        const foundDeleteDownload = await client.getDownloadIndexByCanonicalUrl(
            secondCanonicalUrl
        )
        expect(!!foundDeleteDownload).toBe(true)
        expect(foundDeleteDownload?.segments.length).toBe(1)
    })

    it("attempting to delete a non-existent indexes does nothing", async () => {
        const canonicalUrl = "https://mymamashouse.com"
        const {client} = createClient(canonicalUrl)
        const initial = new Cargo<Permissions>({name: "my-cargo"})
        const index = cargoToCargoIndex(canonicalUrl, initial)
        await client.putCargoIndex(
            index,
        )
        const foundInitial = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!foundInitial).toBe(true)
        const nonExistentUrl = "https://mygrandmashouse.com"
        const deleteReponse = await client.deleteCargoIndex(nonExistentUrl)
        expect(deleteReponse).toBe(Shabah.STATUS.remoteResourceNotFound)
        const afterDelete = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!afterDelete).toBe(true)
    })

    it("calling delete cargo on a particular cargo should delete cargo index and all associated files", async () => {
        const origin = "https://mymamashouse.com"
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const files = [
            {name: "index.js", bytes: 0, invalidation: "default"},
            {name: "style.css", bytes: 0, invalidation: "default"},
            {name: "pic.png", bytes: 0, invalidation: "default"},
        ]
        const cargoToDelete = new Cargo<Permissions>({
            name: "my-cargo",
            files: files as Cargo["files"]
        })
        const cacheFiles = files.reduce((total, next) => {
            const {name, bytes} = next
            total[`${origin}/${name}`] = () => {
                return new Response("", {
                    status: 200,
                    headers: {"content-length": bytes.toString()}
                })
            }
            return total
        }, {
            [`${origin}/${MANIFEST_NAME}`]: () => {
                return new Response(JSON.stringify(cargoToDelete), {
                    status: 200
                })
            }
        })
        const {client, caches} = createClient(canonicalUrl, {
            cacheFiles
        })
        const {innerFileCache} = caches
        const filesWithManifest = [
            ...files,
            {name: MANIFEST_NAME, bytes: 0, invalidation: "default"}
        ]
        for (const {name} of filesWithManifest) {
            const url = `${origin}/${name}`
            const inCache = innerFileCache.getFile(url)
            expect(!!inCache).toBe(true)
        }
        const index = cargoToCargoIndex(
            canonicalUrl, cargoToDelete, {
                resolvedUrl: origin + "/"
            }
        )
        await client.putCargoIndex(index)
        const foundInitial = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!foundInitial).toBe(true)
        const deleteResponse = await client.deleteCargo(canonicalUrl)
        expect(deleteResponse.ok).toBe(true)
        expect(deleteResponse.data).toBe(Shabah.STATUS.ok)
        for (const {name} of filesWithManifest) {
            const url = `${origin}/${name}`
            const inCache = innerFileCache.getFile(url)
            expect(!!inCache).toBe(false)
        }
        const foundAfterDelete = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!foundAfterDelete).toBe(false)
    })
})

describe("reading and writing download indexes", () => {
    it("can create download index", async () => {
        const origin = "https://testing.org"
        const canonicalUrl = origin + "/"
        const {client} = createClient(origin)
        await client.putDownloadIndex({
            id: "tmp",
            previousId: "",
            bytes: 0,
            title: "update 1",
            segments: [
                {
                    resolvedUrl: canonicalUrl,
                    canonicalUrl,
                    map: {},
                    version: "0.2.0",
                    previousVersion: "0.1.0",
                    bytes: 0,
                    resourcesToDelete: [],
                }
            ]
            
        })
        const found = await client.getDownloadIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!found).toBe(true)
    })

    it("calling put on existing index should overwrite it", async () => {
        const origin = "https://testing.org"
        const canonicalUrl = origin + "/"
        const {client} = createClient(origin)
        const initialVersion = "0.2.0"
        await client.putDownloadIndex({
            id: "tmp",
            previousId: '',
            bytes: 0,
            title: "update 1",
            segments: [
                {
                    resolvedUrl: canonicalUrl,
                    canonicalUrl,
                    map: {},
                    version: initialVersion,
                    previousVersion: "0.1.0",
                    bytes: 0,
                    resourcesToDelete: [],
                }
            ]
        })
        const found = await client.getDownloadIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!found).toBe(true)
        expect(found?.segments[0].version).toBe(initialVersion)
        const changedVersion = "0.2.0"
        await client.putDownloadIndex({
            id: "tmp",
            previousId: "",
            bytes: 0,
            title: "update 1",
            segments: [
                {
                    resolvedUrl: changedVersion,
                    canonicalUrl,
                    map: {},
                    version: initialVersion,
                    previousVersion: "0.1.0",
                    bytes: 0,
                    resourcesToDelete: [],
                }
            ]
        })
        const foundAfterMutation = await client.getDownloadIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!foundAfterMutation).toBe(true)
        expect(found?.segments[0].version).toBe(changedVersion)
    })

    it("attempting to delete a non-existent download index should do nothing", async () => {
        const origin = "https://testing.org"
        const canonicalUrl = origin + "/"
        const {client} = createClient(origin)
        const initialVersion = "0.2.0"
        await client.putDownloadIndex({
            id: "tmp",
            previousId: "",
            bytes: 0,
            title: "update 1",
            segments: [
                {
                    resolvedUrl: canonicalUrl,
                    canonicalUrl,
                    map: {},
                    version: initialVersion,
                    previousVersion: "0.1.0",
                    bytes: 0,
                    resourcesToDelete: [],
                }
            ]
        })
        const found = await client.getDownloadIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!found).toBe(true)
        const randomIndex = "https://does-not-exist.com"
        const response = await client.deleteDownloadIndex(
            randomIndex
        )
        expect(response.ok).toBe(true)
        expect(response.data).toBe(Shabah.STATUS.remoteResourceNotFound)
    })
})

describe("finding full cargos", () => {
    it("if cargo is not found an error should be returned", async () => {
        const origin = "https://a-new-website-.com"
        const canonicalUrl = origin + "/"
        const {client} = createClient(origin, {
            cacheFiles: {}
        })
        const response = await client.getCargoAtUrl(canonicalUrl)
        expect(response.ok).toBe(false)
        expect(response.data).toBe(null)
    })

    it("if cargo is found and is valid, a parsed version should be returned", async () => {
        const origin = "https://a-new-website-.com"
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const cargo = new Cargo<Permissions>({name: "good cargo"})
        const {client} = createClient(origin, {
            cacheFiles: {
                [`${origin}/${MANIFEST_NAME}`]: () => {
                    return new Response(JSON.stringify(cargo), {
                        status: 200
                    })
                }
            }
        })
        await client.putCargoIndex(
            cargoToCargoIndex(canonicalUrl, cargo, {
                resolvedUrl: origin + "/"
            }),
        )
        const response = await client.getCargoAtUrl(canonicalUrl)
        expect(response.ok).toBe(true)
        expect(structuredClone(response.data?.pkg)).toStrictEqual(structuredClone(cargo))
    })
})

describe("querying download state", () => {
    it("if cargo has been queued for download state should be queryable", async () => {
        const mainOrigin = "https://my-mamas-house.com"
        const origins = [
            "https://1.com",
            "https://2.com",
            "https://3.com"
        ] as const
        const cases = [
            {
                downloadableResources: [
                    {requestUrl: `${origins[0]}/index.js`, storageUrl: `${origins[0]}/index.js`, bytes: 500}
                ],
                origin: origins[0]
            },
            {
                downloadableResources: [
                    {requestUrl: `${origins[1]}/index.js`, storageUrl: `${origins[1]}/index.js`, bytes: 500},
                    {requestUrl: `${origins[1]}/style.css`, storageUrl: `${origins[1]}/style.css`, bytes: 2_300},
                ],
                origin: origins[1]
            },
            {
                downloadableResources: [
                    {requestUrl: `${origins[2]}/index.js`, storageUrl: `${origins[2]}/index.js`, bytes: 2},
                    {requestUrl: `${origins[2]}/style.css`, storageUrl: `${origins[2]}/style.css`, bytes: 1},
                    {requestUrl: `${origins[2]}/pic.png`, storageUrl: `${origins[2]}/pic.png`, bytes: 8},
                ],
                origin: origins[2]
            },
        ]
        for (const {downloadableResources, origin} of cases) {
            const {client, downloadState} = createClient(mainOrigin, {
                cacheFiles: {},
                networkFiles: {}
            })
            expect(downloadState.queuedDownloads.length).toBe(0)
            const canonicalUrl = origin + "/"
            const resolvedUrl = canonicalUrl
            const tag = Math.trunc(Math.random() * 1_000)
            const updateResponse = createUpdateCheck({
                tag,
                resolvedUrl,
                originalResolvedUrl: resolvedUrl,
                canonicalUrl,
                status: Shabah.STATUS.ok,
                diskInfo: {used: 0, total: 10_000, left: 10_000},
                newCargo: new Cargo(),
                originalNewCargoResponse: new Response(),
                downloadableResources,
                resourcesToDelete: []
            })
            const queueResponse = await client.executeUpdates(
                [updateResponse],
                "my update"
            )
            expect(queueResponse.ok).toBe(true)
            expect(queueResponse.data).toBe(Shabah.STATUS.updateQueued)
            expect(downloadState.queuedDownloads.length).toBe(1)
            const cargoIndex = await client.getCargoIndexByCanonicalUrl(
                canonicalUrl
            ) 
            expect(cargoIndex).not.toBe(null)
            const state = await client.getDownloadState(
                canonicalUrl
            )
            expect(state).not.toBe(null)
            expect(state?.id || "1").toBe(cargoIndex?.downloadId || "2")
            const downloadTotal = downloadableResources.reduce(
                (total, next) => total + next.bytes,
                0
            )
            expect(state?.total).toBe(downloadTotal)
        }
    })

    it("if cargo has not been queued for download, download state should return null", async () => {
        const tests = [
            "https://hi.com",
            "https://no.com",
            "https://sushi.org"
        ]
        for (const origin of tests) {
            const {client} = createClient(origin, {})
            const canonicalUrl = origin + "/"
            const downloadState = await client.getDownloadState(canonicalUrl)
            expect(downloadState).toBe(null)
        }
    })
})