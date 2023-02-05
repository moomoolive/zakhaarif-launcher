import { describe, it, expect } from "vitest"
import {Shabah} from "./downloadClient"
import {CargoIndex, CargoState, DownloadSegment, FileCache, getErrorDownloadIndex, NO_UPDATE_QUEUED, ResourceMap, saveErrorDownloadIndex} from "./backend"
import {DownloadManager} from "./backend"
import { Cargo, MANIFEST_MINI_NAME, MANIFEST_NAME, NULL_FIELD, toMiniCargo } from "../cargo"
import { Permissions } from "../types/permissions"
import { SemVer } from "../smallSemver"
import { cleanPermissions } from "../utils/security/permissionsSummary"
import {UpdateCheckConfig, UpdateCheckResponse} from "./updateCheckStatus"
import { nanoid } from "nanoid"

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
        id = `id-${Math.trunc(Math.random() * 50_000)}`,
        resolvedUrl,
        bytes = 0,
        state = "cached" as CargoState,
        downloadQueueId = NO_UPDATE_QUEUED
    }: Partial<{
        id: string
        resolvedUrl: string
        bytes: number
        state: CargoState,
        downloadQueueId: string
    }> = {}
) => {
    const index: CargoIndex = {
        id,
        name: cargo.name,
        logoUrl: cargo.crateLogoUrl,
        resolvedUrl: resolvedUrl || canonicalUrl,
        canonicalUrl,
        bytes,
        entry: cargo.entry,
        version: cargo.version,
        permissions: cargo.permissions,
        state,
        storageBytes: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        downloadQueueId
    }
    return index
}

const mockCargo = new Cargo<Permissions>({
    name: "test",
    version: "0.1.0",
    crateVersion: "0.1.0",
    files: [],
})

describe("initialization", () => {
    it("should throw exception if origin is not a full url", () => {
        const {adaptors} = dependencies({})
        const fail = (origin: string) => {
            return () => new Shabah({origin, adaptors})
        }
        expect(fail("")).toThrow()
        expect(fail("data:svg+xml:adfasflkasldjfk")).toThrow()
        expect(fail("/mydomain")).toThrow()
        expect(fail("/relative_url")).toThrow()
    })
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

const badHttpResponse = (status = 0) => {
    return () => new Response("", {status: 404})
}
const networkError = () => {
    return () => {
        throw new Error("network error")
        return new Response("", {status: 200})
    }
}
const okResponse = ({status = 200, body = "", length = 0} = {}) => {
    return () => new Response(body, {
        status,
        headers: {"content-length": length.toString()}
    })
}

describe("checking for cargo updates", () => {
    it("should throw exception if canonicalUrl of cargo is not a full url", () => {
        const origin = "https://my-house.org"
        const {client} = createClient(origin, {})
        const cases = [
            {canonicalUrl: "", id: "rand-2"},
            {canonicalUrl: "data:svg+xml:asdfasf", id: "rand-2"},
            {canonicalUrl: "/yes", id: "rand-2"},
            {canonicalUrl: "./relative", id: "rand-2"},
        ] as const
        for (const c of cases) {
            expect(() => client.checkForCargoUpdates(c)).rejects.toThrow()
        }
    })

    it("if http error encountered when requesting new cargo, errorOccurred should be true", async () => {
        type TestConfig = {
            cargoOrigin: string
            errorType: "network" | "bad-http"
            previousCargo?: () => null | Response
            newCargo: () => null | Response
        }
        const initTestCase = ({
            cargoOrigin,
            errorType,
            newCargo,
            previousCargo
        }: TestConfig) => {
            const networkFiles = newCargo 
                ? {[`${cargoOrigin}/${MANIFEST_NAME}`]: newCargo}
                : {}
            const cacheFiles = previousCargo
                ? {[`${cargoOrigin}/${MANIFEST_NAME}`]: previousCargo}
                : {}
            return {networkFiles, cacheFiles, errorType}
        }
        const cargoOrigin = `https://cargo-house.repo/pkg`
        const cases = [
            initTestCase({
                cargoOrigin,
                errorType: "network", 
                newCargo: () => {
                    throw new Error("network error")
                    return new Response("")
                }
            }),
            initTestCase({
                cargoOrigin,
                errorType: "bad-http", 
                newCargo: () => {
                    return new Response("", {status: 400})
                }
            }),
            initTestCase({
                cargoOrigin,
                errorType: "network",
                newCargo: () => {
                    throw new Error("network error")
                    return new Response("")
                },
                previousCargo: () => {
                    return new Response(JSON.stringify(mockCargo), {
                        status: 200
                    })
                }
            }),
            initTestCase({
                cargoOrigin,
                errorType: "bad-http",
                newCargo: () => {
                    return new Response("", {status: 500})
                },
                previousCargo: () => {
                    return new Response(JSON.stringify(mockCargo), {
                        status: 200
                    })
                }
            }),
        ] as const
        const origin = "https://my-house.org"
        for (const {networkFiles, cacheFiles, errorType} of cases) {
            const {client} = createClient(origin, {
                networkFiles, cacheFiles
            })
            const perviousCargoExists = Object.keys(cacheFiles).length > 0
            if (perviousCargoExists) {
                const cargoUrl = Object.keys(cacheFiles)[0]
                await client.putCargoIndex(
                    cargoToCargoIndex(
                        cargoOrigin,
                        await (cacheFiles[cargoUrl]()!).json(),
                    ),
    
                )
                expect(await client.getCargoIndexByCanonicalUrl(cargoOrigin)).not.toBe(null)
            }
            const response = await client.checkForCargoUpdates({
                canonicalUrl: cargoOrigin,
                id: "random"
            })
            expect(response.errorOccurred()).toBe(true)
            if (errorType === "network") {
                expect(response.status).toBe(Shabah.STATUS.networkError)
            } else if (errorType === "bad-http") {
                expect(response.status).toBe(Shabah.STATUS.badHttpCode)
            }
            if (perviousCargoExists) {
                expect(response.previousVersionExists()).toBe(true)
            }
        }
    })

    it("if requests cargo request succeeds but cargo is incorrectly encoded, errorOccurred should be true", async () => {
        type TestConfig = {
            cargoOrigin: string
            errorType: "json" | "bad-cargo"
            previousCargo?: () => null | Response
            newCargo: () => null | Response
        }
        const initTestCase = ({
            cargoOrigin,
            errorType,
            newCargo,
            previousCargo
        }: TestConfig) => {
            const networkFiles = newCargo 
                ? {[`${cargoOrigin}/${MANIFEST_NAME}`]: newCargo}
                : {}
            const cacheFiles = previousCargo
                ? {[`${cargoOrigin}/${MANIFEST_NAME}`]: previousCargo}
                : {}
            return {networkFiles, cacheFiles, errorType}
        }
        const cargoOrigin = `https://cargo-house.repo/pkg`
        const invalidJson = "{"
        const invalidCargo = "{}"
        const cases = [
            initTestCase({
                cargoOrigin,
                errorType: "json", 
                newCargo: () => {
                    return new Response(invalidJson, {status: 200})
                }
            }),
            initTestCase({
                cargoOrigin,
                errorType: "bad-cargo", 
                newCargo: () => {
                    return new Response(invalidCargo, {status: 200})
                }
            }),
            initTestCase({
                cargoOrigin,
                errorType: "json", 
                newCargo: () => {
                    return new Response(invalidJson, {status: 200})
                },
                previousCargo: () => {
                    return new Response(JSON.stringify(mockCargo), {
                        status: 200
                    })
                }
            }),
            initTestCase({
                cargoOrigin,
                errorType: "bad-cargo", 
                newCargo: () => {
                    return new Response(invalidCargo, {status: 200})
                },
                previousCargo: () => {
                    return new Response(JSON.stringify(mockCargo), {
                        status: 200
                    })
                }
            }),
        ] as const
        const origin = "https://my-house.org"
        for (const {networkFiles, cacheFiles, errorType} of cases) {
            const {client} = createClient(origin, {
                networkFiles, cacheFiles
            })
            const perviousCargoExists = Object.keys(cacheFiles).length > 0
            if (perviousCargoExists) {
                const cargoUrl = Object.keys(cacheFiles)[0]
                await client.putCargoIndex(
                    cargoToCargoIndex(
                        cargoOrigin,
                        await (cacheFiles[cargoUrl]()!).json(),
                    ),
    
                )
                expect(await client.getCargoIndexByCanonicalUrl(cargoOrigin)).not.toBe(null)
            }
            const response = await client.checkForCargoUpdates({
                canonicalUrl: cargoOrigin,
                id: "random"
            })
            expect(response.errorOccurred()).toBe(true)
            if (errorType === "bad-cargo") {
                expect(response.status).toBe(Shabah.STATUS.invalidCargo)
            } else if (errorType === "json") {
                expect(response.status).toBe(Shabah.STATUS.encodingNotAcceptable)
            }
            if (perviousCargoExists) {
                expect(response.previousVersionExists()).toBe(true)
            }
        }
    })

    it("if one of files listed in cargo is unreachable, returns a bad http code, or does not have 'content-length' header, an errorOccurred should be true", async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const testCargo = structuredClone(mockCargo)
        const testFile1 = "index.js"
        const testFile2 = "styles.css"
        testCargo.files.push(
            {name: testFile1, bytes: 0, invalidation: "default"},
            {name: testFile2, bytes: 0, invalidation: "default"},
        )
        const cases = [
            {
                file1: badHttpResponse(404),
                file2: okResponse() 
            },
            {
                file1: networkError(),
                file2: okResponse()
            },
            {
                file1: okResponse(),
                file2: badHttpResponse(404)
            },
            {
                file1: okResponse(),
                file2: networkError()
            },
            {
                file1: networkError(),
                file2: networkError()
            },
            {
                file1: badHttpResponse(500),
                file2: badHttpResponse(404)
            },
        ] as const
        for (const {file1, file2} of cases) {
            const {client} = createClient(origin, {
                networkFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(testCargo),
                            {status: 200}
                        )
                    },
                    [`${cargoOrigin}/${testFile1}`]: file1,
                    [`${cargoOrigin}/${testFile2}`]: file2
                }
            })
            const response = await client.checkForCargoUpdates(
                {canonicalUrl: cargoOrigin, id: "tmp"}
            )
            expect(response.errorOccurred()).toBe(true)
            expect(response.status).toBe(Shabah.STATUS.preflightVerificationFailed)
        }
    })

    it("if cargo is fetched correct, errorOccurred should be false", async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const testCargo = structuredClone(mockCargo)
        const testFile = "index.js"
        testCargo.files.push(
            {name: testFile, bytes: 0, invalidation: "default"}
        )
        const {client} = createClient(origin, {
            networkFiles: {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(testCargo),
                        {status: 200}
                    )
                },
                [`${cargoOrigin}/${testFile}`]: () => {
                    return new Response("", {
                        status: 200,
                        headers: {"content-length": "0"}
                    })
                }
            }
        })
        const response = await client.checkForCargoUpdates(
            {canonicalUrl: cargoOrigin, id: "tmp"}
        )
        expect(response.errorOccurred()).toBe(false)
        expect(response.newCargo).not.toBe(null)
        expect(await response.originalNewCargoResponse.text()).toStrictEqual(
            JSON.stringify(testCargo)
        )
        expect(response.resolvedUrl).toBe(cargoOrigin + "/")
    })

    it("if cargo is fetched correct and encounter redirect, errorOccurred should be false and resolved url should be the url that was redirected to", async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const redirectOrigin = "https://redirect.go"
        const {client} = createClient(origin, {
            networkFiles: {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(mockCargo),
                        {status: 200}
                    )
                },
                [`${redirectOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        "",
                        {status: 302, headers: {
                            "location": `${cargoOrigin}/${MANIFEST_NAME}`
                        }}
                    )
                }
            }
        })
        const response = await client.checkForCargoUpdates(
            {canonicalUrl: redirectOrigin, id: "tmp"}
        )
        expect(response.errorOccurred()).toBe(false)
        expect(response.newCargo).not.toBe(null)
        expect(await response.originalNewCargoResponse.text()).toStrictEqual(
            JSON.stringify(mockCargo)
        )
        expect(response.canonicalUrl).toBe(redirectOrigin + "/")
        expect(response.resolvedUrl).toBe(cargoOrigin + "/")
    })

    it("if cargo is fetched correctly and there is not enough storage space for cargo, enoughStorageForCargo should be false", async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const testCargo = structuredClone(mockCargo)
        const filesize = 10_000
        const testFile = "index.js"
        testCargo.files.push(
            {name: testFile, bytes: 0, invalidation: "default"}
        )
        const currentBytesUsed = 200
        const allowBytes = 500
        expect(currentBytesUsed + filesize).toBeGreaterThan(allowBytes)
        const {client} = createClient(origin, {
            cacheQuota: {usage: currentBytesUsed, quota: allowBytes},
            networkFiles: {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(testCargo),
                        {status: 200}
                    )
                },
                [`${cargoOrigin}/${testFile}`]: () => {
                    return new Response("", {
                        status: 200,
                        headers: {"content-length": filesize.toString()}
                    })
                }
            }
        })
        const response = await client.checkForCargoUpdates(
            {canonicalUrl: cargoOrigin, id: "tmp"}
        )
        expect(response.enoughStorageForCargo()).toBe(false)
        expect(response.errorOccurred()).toBe(false)
        expect(response.newCargo).not.toBe(null)
        expect(response.resolvedUrl).toBe(cargoOrigin + "/")
    })

    it(`if cargo was not previously installed, previous cargo should be null and previous cargo version should be "${Shabah.NO_PREVIOUS_INSTALLATION}"`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const testCargo = structuredClone(mockCargo)
        const testFile = "index.js"
        testCargo.files.push(
            {name: testFile, bytes: 0, invalidation: "default"}
        )
        const {client} = createClient(origin, {
            networkFiles: {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(testCargo),
                        {status: 200}
                    )
                },
                [`${cargoOrigin}/${testFile}`]: () => {
                    return new Response("", {
                        status: 200,
                        headers: {"content-length": "0"}
                    })
                }
            }
        })
        const response = await client.checkForCargoUpdates(
            {canonicalUrl: cargoOrigin, id: "tmp"}
        )
        expect(response.errorOccurred()).toBe(false)
        expect(response.newCargo).not.toBe(null)
        expect(response.previousCargo).toBe(null)
        expect(response.versions().new).toBe(testCargo.version)
        expect(response.versions().old).toBe(Shabah.NO_PREVIOUS_INSTALLATION)
    })

    it(`if cargo was previously installed, previous cargo should not be null and previous cargo version should be a valid version`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const oldCargo = structuredClone(mockCargo)
        const testFile = "index.js"
        oldCargo.files.push(
            {name: testFile, bytes: 0, invalidation: "default"}
        )
        const newCargo = structuredClone(oldCargo)
        newCargo.version = "2.0.0"
        const {client} = createClient(origin, {
            cacheFiles: {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(oldCargo),
                        {status: 200}
                    )
                },
            },
            networkFiles: {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(newCargo),
                        {status: 200}
                    )
                },
                [`${cargoOrigin}/${testFile}`]: () => {
                    return new Response("", {
                        status: 200,
                        headers: {"content-length": "0"}
                    })
                }
            }
        })
        await client.putCargoIndex(
            cargoToCargoIndex(cargoOrigin, oldCargo),
        )
        const response = await client.checkForCargoUpdates(
            {canonicalUrl: cargoOrigin, id: "tmp"}
        )
        expect(response.errorOccurred()).toBe(false)
        expect(response.newCargo).not.toBe(null)
        expect(response.previousCargo).not.toBe(null)
        expect(response.versions().new).toBe(newCargo.version)
        expect(response.versions().old).toBe(oldCargo.version)
    })

    it(`if fetched cargo is a greater version, update available should be true, other wise should be false`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const cases = [
            {oldV: "1.5.0", newV: "2.0.0", updateAvailable: true},
            {oldV: "2.5.0", newV: "2.5.1", updateAvailable: true},
            {oldV: "1.0.0", newV: "0.1.0", updateAvailable: false},
            {oldV: "5.60.7", newV: "5.7.16", updateAvailable: false},
        ] as const
        for (const {oldV, newV, updateAvailable} of cases) {
            const oldCargo = structuredClone(mockCargo)
            oldCargo.version = oldV
            const testFile = "index.js"
            oldCargo.files.push(
                {name: testFile, bytes: 0, invalidation: "default"}
            )
            const newCargo = structuredClone(oldCargo)
            newCargo.version = newV
            const {client} = createClient(origin, {
                cacheFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(oldCargo),
                            {status: 200}
                        )
                    },
                },
                networkFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(newCargo),
                            {status: 200}
                        )
                    },
                    [`${cargoOrigin}/${testFile}`]: () => {
                        return new Response("", {
                            status: 200,
                            headers: {"content-length": "0"}
                        })
                    }
                }
            })
            await client.putCargoIndex(
                cargoToCargoIndex(cargoOrigin, oldCargo),

            )
            const response = await client.checkForCargoUpdates(
                {canonicalUrl: cargoOrigin, id: "tmp"}
            )
            const newVersion = SemVer.fromString(newCargo.version)!
            const oldVersion = SemVer.fromString(oldCargo.version)!
            const newIsGreater = newVersion.isGreater(oldVersion)
            expect(newIsGreater).toBe(updateAvailable)
            expect(response.updateAvailable()).toBe(updateAvailable)
            expect(response.errorOccurred()).toBe(false)
            
            if (newIsGreater) {
                expect(response.newCargo).not.toBe(null)
                expect(response.versions().new).toBe(newCargo.version)
                expect(response.previousCargo).not.toBe(null)
                expect(response.versions().old).toBe(oldCargo.version)
            } else {
                expect(response.newCargo).toBe(null)
                expect(response.versions().new).toBe(Shabah.NO_PREVIOUS_INSTALLATION)
                expect(response.previousCargo).not.toBe(null)
                expect(response.versions().old).toBe(oldV)   
            }
           
        }
    })

    it(`if previous installation exists, "${MANIFEST_MINI_NAME}" should always be fetched first when checking for new cargo`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const cases = [
            {oldV: "1.5.0", newV: "2.0.0", updateAvailable: true},
            {oldV: "2.5.0", newV: "2.5.1", updateAvailable: true},
            {oldV: "1.0.0", newV: "0.1.0", updateAvailable: false},
            {oldV: "5.60.7", newV: "5.7.16", updateAvailable: false},
        ] as const
        for (const {oldV, newV, updateAvailable} of cases) {
            const oldCargo = structuredClone(mockCargo)
            oldCargo.version = oldV
            const testFile = "index.js"
            oldCargo.files.push(
                {name: testFile, bytes: 0, invalidation: "default"}
            )
            const newCargo = structuredClone(oldCargo)
            newCargo.version = newV
            const {client, caches: {networkCache}} = createClient(origin, {
                cacheFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(oldCargo),
                            {status: 200}
                        )
                    },
                },
                networkFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(newCargo),
                            {status: 200}
                        )
                    },
                    [`${cargoOrigin}/${testFile}`]: () => {
                        return new Response("", {
                            status: 200,
                            headers: {"content-length": "0"}
                        })
                    }
                }
            })
            await client.putCargoIndex(
                cargoToCargoIndex(cargoOrigin, oldCargo),

            )
            const response = await client.checkForCargoUpdates(
                {canonicalUrl: cargoOrigin, id: "tmp"}
            )
            const newVersion = SemVer.fromString(newCargo.version)!
            const oldVersion = SemVer.fromString(oldCargo.version)!
            const newIsGreater = newVersion.isGreater(oldVersion)
            expect(newIsGreater).toBe(updateAvailable)
            expect(response.updateAvailable()).toBe(updateAvailable)
            expect(response.errorOccurred()).toBe(false)
            const miniRequestIndex = networkCache.accessLog.findIndex(
                (log) => log.url.includes(MANIFEST_MINI_NAME)
            )
            const fullRequestIndex = networkCache.accessLog.findIndex(
                (log) => log.url.includes(MANIFEST_NAME)
            )
            expect(miniRequestIndex).lessThan(fullRequestIndex)
        }
    })

    it(`if previous installation exists, and mini manifest version is not greater than current installation, fetch for full manifest should be averted`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const cases = [
            {oldV: "1.5.0", newV: "1.0.0", updateAvailable: false},
            {oldV: "2.5.0", newV: "2.4.1", updateAvailable: false},
            {oldV: "1.0.0", newV: "0.1.0", updateAvailable: false},
            {oldV: "5.60.7", newV: "5.7.16", updateAvailable: false},
        ] as const
        for (const {oldV, newV, updateAvailable} of cases) {
            const oldCargo = structuredClone(mockCargo)
            oldCargo.version = oldV
            const testFile = "index.js"
            oldCargo.files.push(
                {name: testFile, bytes: 0, invalidation: "default"}
            )
            const newCargo = structuredClone(oldCargo)
            newCargo.version = newV
            const {client, caches: {networkCache}} = createClient(origin, {
                cacheFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(oldCargo),
                            {status: 200}
                        )
                    },
                },
                networkFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(newCargo),
                            {status: 200}
                        )
                    },
                    [`${cargoOrigin}/${MANIFEST_MINI_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(toMiniCargo(newCargo)),
                            {status: 200}
                        )
                    },
                    [`${cargoOrigin}/${testFile}`]: () => {
                        return new Response("", {
                            status: 200,
                            headers: {"content-length": "0"}
                        })
                    }
                }
            })
            await client.putCargoIndex(
                cargoToCargoIndex(cargoOrigin, oldCargo),

            )
            const response = await client.checkForCargoUpdates(
                {canonicalUrl: cargoOrigin, id: "tmp"}
            )
            const newVersion = SemVer.fromString(newCargo.version)!
            const oldVersion = SemVer.fromString(oldCargo.version)!
            const newIsGreater = newVersion.isGreater(oldVersion)
            expect(newIsGreater).toBe(updateAvailable)
            expect(response.updateAvailable()).toBe(updateAvailable)
            expect(response.errorOccurred()).toBe(false)
            const miniRequest = networkCache.accessLog.find(
                (log) => log.url.includes(MANIFEST_MINI_NAME)
            )
            const fullRequest = networkCache.accessLog.find(
                (log) => log.url.includes(MANIFEST_NAME)
            )
            expect(!!miniRequest).toBe(true)
            expect(!!fullRequest).toBe(false)
        }
    })

    it(`if previous installation does not exist and fetch of cargo is successfull, updateAvailable should always return`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const cases = [
            {newV: "1.0.0"},
            {newV: "2.4.1"},
            {newV: "0.1.0"},
            { newV: "5.7.16"},
        ] as const
        for (const {newV} of cases) {
            const oldCargo = structuredClone(mockCargo)
            const testFile = "index.js"
            const newCargo = structuredClone(mockCargo)
            newCargo.version = newV
            const {client} = createClient(origin, {
                cacheFiles: {
                    
                },
                networkFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(newCargo),
                            {status: 200}
                        )
                    },
                    [`${cargoOrigin}/${MANIFEST_MINI_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(toMiniCargo(newCargo)),
                            {status: 200}
                        )
                    },
                    [`${cargoOrigin}/${testFile}`]: () => {
                        return new Response("", {
                            status: 200,
                            headers: {"content-length": "0"}
                        })
                    }
                }
            })
            await client.putCargoIndex(
                cargoToCargoIndex(cargoOrigin, oldCargo),

            )
            const response = await client.checkForCargoUpdates(
                {canonicalUrl: cargoOrigin, id: "tmp"}
            )
            expect(response.updateAvailable()).toBe(true)
            expect(response.errorOccurred()).toBe(false)
        }
    })

    it(`if fetch is successful non-existent permissions should be filtered out`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const cases = [
            ["random-2", "random01"],
            ["x-camera", "x"],
            ["z", "z-location"],
        ] as const
        for (const permissions of cases) {
            const oldCargo = structuredClone(mockCargo)
            const testFile = "index.js"
            const newCargo = structuredClone(mockCargo)
            {(newCargo.permissions as any) = permissions}
            const {client} = createClient(origin, {
                cacheFiles: {
                    
                },
                networkFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(newCargo),
                            {status: 200}
                        )
                    },
                    [`${cargoOrigin}/${testFile}`]: () => {
                        return new Response("", {
                            status: 200,
                            headers: {"content-length": "0"}
                        })
                    }
                }
            })
            await client.putCargoIndex(
                cargoToCargoIndex(cargoOrigin, oldCargo),

            )
            const response = await client.checkForCargoUpdates(
                {canonicalUrl: cargoOrigin, id: "tmp"}
            )
            expect(response.updateAvailable()).toBe(true)
            expect(response.newCargo).not.toBe(null)
            expect(response.newCargo?.permissions).toStrictEqual([])
        }
    })

    it(`if fetch is successful valid duplicate permissions should be filtered out`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const cases = [
            ["camera", "camera"],
            ["geoLocation", "geoLocation"],
            ["microphone", "microphone"],
        ] as const
        for (const permissions of cases) {
            const oldCargo = structuredClone(mockCargo)
            const testFile = "index.js"
            const newCargo = structuredClone(mockCargo)
            {(newCargo.permissions as any) = permissions}
            const {client} = createClient(origin, {
                cacheFiles: {
                    
                },
                networkFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(newCargo),
                            {status: 200}
                        )
                    },
                    [`${cargoOrigin}/${testFile}`]: () => {
                        return new Response("", {
                            status: 200,
                            headers: {"content-length": "0"}
                        })
                    }
                }
            })
            await client.putCargoIndex(
                cargoToCargoIndex(cargoOrigin, oldCargo),

            )
            const response = await client.checkForCargoUpdates(
                {canonicalUrl: cargoOrigin, id: "tmp"}
            )
            expect(response.updateAvailable()).toBe(true)
            expect(response.newCargo).not.toBe(null)
            expect(response.newCargo?.permissions.length).toBe(1)
        }
    })

    it(`if previous cargo exists, downloadable resources should be returned as the difference between new and old cargo files`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const cases = [
            {
                oldFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                ], 
                newFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                    {name: "style.css", bytes: 200, invalidation: "default"},
                ],
            },
            {
                oldFiles: [
                    {name: "entry.js", bytes: 100, invalidation: "default"},
                    {name: "yes.html", bytes: 399, invalidation: "default"},
                    {name: "pic.png", bytes: 555, invalidation: "default"},
                ], 
                newFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                    {name: "style.css", bytes: 200, invalidation: "default"},
                ],
            },
            {
                oldFiles: [
                    {name: "entry.js", bytes: 100, invalidation: "default"},
                    {name: "yes.html", bytes: 399, invalidation: "default"},
                    {name: "pic.png", bytes: 555, invalidation: "default"},
                ], 
                newFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                    {name: "entry.js", bytes: 100, invalidation: "default"},
                    {name: "pic.png", bytes: 100, invalidation: "default"},
                    {name: "style.css", bytes: 200, invalidation: "default"},
                    {name: "style1.css", bytes: 200, invalidation: "default"},
                ],
            },
        ]
        for (const {oldFiles, newFiles} of cases) {

            const oldCargo = structuredClone(mockCargo)
            oldCargo.version = "0.1.0"
            oldCargo.files = [...oldFiles] as typeof oldCargo.files
            
            const cacheFileBase = {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(oldCargo),
                        {status: 200}
                    )
                },
            }
            const cacheFiles = oldCargo.files.reduce((total, next) => {
                const {name, bytes} = next
                total[`${cargoOrigin}/${name}`] = okResponse({
                    status: 200,
                    length: bytes
                })
                return total
            }, cacheFileBase)

            const newCargo = structuredClone(oldCargo)
            newCargo.version = "1.0.0"
            newCargo.files = [...newFiles] as typeof newCargo.files
            
            const networkFilesBase = {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(newCargo),
                        {status: 200}
                    )
                },
                [`${cargoOrigin}/${MANIFEST_MINI_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(toMiniCargo(newCargo)),
                        {status: 200}
                    )
                }
            }
            const networkFiles = newCargo.files.reduce((total, next) => {
                const {name, bytes} = next
                total[`${cargoOrigin}/${name}`] = okResponse({
                    status: 200,
                    length: bytes
                })
                return total
            }, networkFilesBase)

            const {client} = createClient(origin, {
                cacheFiles,
                networkFiles
            })
            await client.putCargoIndex(
                cargoToCargoIndex(cargoOrigin, oldCargo),

            )
            const response = await client.checkForCargoUpdates(
                {canonicalUrl: cargoOrigin, id: "tmp"}
            )
            expect(response.updateAvailable()).toBe(true)
            expect(response.errorOccurred()).toBe(false)
            expect(response.downloadMetadata().downloadableResources.length).toBeGreaterThan(0)

            const oldFileMap = new Map<string, number>()
            for (const {name} of oldFiles) {
                oldFileMap.set(`${cargoOrigin}/${name}`, 1)
            }

            const newFileMap = new Map<string, number>()
            for (const {name} of newFiles) {
                newFileMap.set(`${cargoOrigin}/${name}`, 1)
            }

            const filesToDownload = []
            for (const {name} of newFiles) {
                const url = `${cargoOrigin}/${name}`
                if (!oldFileMap.has(`${cargoOrigin}/${name}`)) {
                    filesToDownload.push(url)
                }
            }

            expect(response.downloadMetadata().downloadableResources.length).toBe(filesToDownload.length)
            for (const url of filesToDownload) {
                const file = response
                    .downloadMetadata()
                    .downloadableResources
                    .find((file) => file.requestUrl === url)
                expect(!!file).toBe(true)
            }

            const filesToDelete = []
            for (const {name} of oldFiles) {
                const url = `${cargoOrigin}/${name}`
                if (!newFileMap.has(url)) {
                    filesToDelete.push(url)
                }
            }
            expect(response.downloadMetadata().resourcesToDelete.length).toBe(filesToDelete.length)
            for (const url of filesToDelete) {
                const file = response
                    .downloadMetadata()
                    .resourcesToDelete
                    .find((file) => file.requestUrl === url)
                expect(!!file).toBe(true)
            }
        }
    })

    it(`downloadable resource url should be prepended with resolved url`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const redirectOrigin = "https://redirect.go"
        const cases = [
            {
                oldFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                ], 
                newFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                    {name: "style.css", bytes: 200, invalidation: "default"},
                ],
            },
            {
                oldFiles: [
                    {name: "entry.js", bytes: 100, invalidation: "default"},
                    {name: "yes.html", bytes: 399, invalidation: "default"},
                    {name: "pic.png", bytes: 555, invalidation: "default"},
                ], 
                newFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                    {name: "style.css", bytes: 200, invalidation: "default"},
                ],
            },
            {
                oldFiles: [
                    {name: "entry.js", bytes: 100, invalidation: "default"},
                    {name: "yes.html", bytes: 399, invalidation: "default"},
                    {name: "pic.png", bytes: 555, invalidation: "default"},
                ], 
                newFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                    {name: "entry.js", bytes: 100, invalidation: "default"},
                    {name: "pic.png", bytes: 100, invalidation: "default"},
                    {name: "style.css", bytes: 200, invalidation: "default"},
                    {name: "style1.css", bytes: 200, invalidation: "default"},
                ],
            },
        ]
        for (const {oldFiles, newFiles} of cases) {

            const oldCargo = structuredClone(mockCargo)
            oldCargo.version = "0.1.0"
            oldCargo.files = [...oldFiles] as typeof oldCargo.files
            
            const cacheFileBase = {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(oldCargo),
                        {status: 200}
                    )
                },
            }
            const cacheFiles = oldCargo.files.reduce((total, next) => {
                const {name, bytes} = next
                total[`${cargoOrigin}/${name}`] = okResponse({
                    status: 200,
                    length: bytes
                })
                return total
            }, cacheFileBase)

            const newCargo = structuredClone(oldCargo)
            newCargo.version = "1.0.0"
            newCargo.files = [...newFiles] as typeof newCargo.files
            
            const networkFilesBase = {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(newCargo),
                        {status: 200}
                    )
                },
                [`${cargoOrigin}/${MANIFEST_MINI_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(toMiniCargo(newCargo)),
                        {status: 200}
                    )
                },
                [`${redirectOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        "",
                        {status: 302, headers: {
                            "location": `${cargoOrigin}/${MANIFEST_NAME}`
                        }}
                    )
                }
            }
            const networkFiles = newCargo.files.reduce((total, next) => {
                const {name, bytes} = next
                total[`${cargoOrigin}/${name}`] = okResponse({
                    status: 200,
                    length: bytes
                })
                return total
            }, networkFilesBase)

            const {client} = createClient(origin, {
                cacheFiles,
                networkFiles
            })
            await client.putCargoIndex(
                cargoToCargoIndex(redirectOrigin, oldCargo, {
                    resolvedUrl: cargoOrigin
                }),

            )
            const response = await client.checkForCargoUpdates(
                {canonicalUrl: redirectOrigin, id: "tmp"}
            )
            expect(response.updateAvailable()).toBe(true)
            expect(response.errorOccurred()).toBe(false)
            expect(response.resolvedUrl).not.toBe(response.canonicalUrl)
            expect(response.resolvedUrl).toBe(cargoOrigin + "/")
            expect(response.downloadMetadata().downloadableResources.length).toBeGreaterThan(0)

            const oldFileMap = new Map<string, number>()
            for (const {name} of oldFiles) {
                oldFileMap.set(`${cargoOrigin}/${name}`, 1)
            }

            const newFileMap = new Map<string, number>()
            for (const {name} of newFiles) {
                newFileMap.set(`${cargoOrigin}/${name}`, 1)
            }

            const filesToDownload = []
            for (const {name} of newFiles) {
                const url = `${cargoOrigin}/${name}`
                if (!oldFileMap.has(`${cargoOrigin}/${name}`)) {
                    filesToDownload.push(url)
                }
            }
            
            expect(response.downloadMetadata().downloadableResources.length).toBe(filesToDownload.length)
            for (const url of filesToDownload) {
                const file = response
                    .downloadMetadata()
                    .downloadableResources
                    .find((file) => file.requestUrl === url)
                expect(!!file).toBe(true)
            }

            const filesToDelete = []
            for (const {name} of oldFiles) {
                const url = `${cargoOrigin}/${name}`
                if (!newFileMap.has(url)) {
                    filesToDelete.push(url)
                }
            }

            expect(response.downloadMetadata().resourcesToDelete.length).toBe(filesToDelete.length)
            for (const url of filesToDelete) {
                const file = response
                    .downloadMetadata()
                    .resourcesToDelete
                    .find((file) => file.requestUrl === url)
                expect(!!file).toBe(true)
            }
        }
    })
})

const createUpdateCheck = (config: Partial<UpdateCheckConfig>) => {
    const {
        status = Shabah.STATUS.ok,
        id = "tmp",
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
        cargoStorageBytes = 0
    } = config
    return new UpdateCheckResponse({
        diskInfo,
        cargoStorageBytes,
        downloadableResources,
        resourcesToDelete,
        previousCargo,
        newCargo,
        originalNewCargoResponse,
        errors,
        id,
        originalResolvedUrl,
        resolvedUrl,
        canonicalUrl,
        status,
    })
}

describe("executing updates", () => {
    it("attempting to queue a download with an empty array does not queue a download", async () => {
        const mainOrigin = "https://yo-mama.com"
        const {client, downloadState} = createClient(mainOrigin, {
            cacheFiles: {},
            networkFiles: {},
        })
        expect(downloadState.queuedDownloads.length).toBe(0)
        const response = await client.executeUpdates([], "none")
        expect(response.ok).toBe(true)
        expect(response.data).toBe(Shabah.STATUS.zeroUpdatesProvided)
        expect(downloadState.queuedDownloads.length).toBe(0)
    })

    it("if update response returned an error code, execute updates should not queue download", async () => {
        const origin = "https://my-mamas-house.com"
        const cases = [
            Shabah.STATUS.networkError,
            Shabah.STATUS.badHttpCode,
            Shabah.STATUS.preflightVerificationFailed,
            Shabah.STATUS.invalidCargo,
        ] as const
        for (const status of cases) {
            const {client, downloadState} = createClient(origin, {
                cacheFiles: {},
                networkFiles: {}
            })
            expect(downloadState.queuedDownloads.length).toBe(0)
            const updateResponse = createUpdateCheck({status})
            const queueResponse = await client.executeUpdates(
                [updateResponse],
                "my update"
            )
            expect(queueResponse.ok).toBe(true)
            expect(queueResponse.data).toBe(Shabah.STATUS.updateImpossible)
            expect(downloadState.queuedDownloads.length).toBe(0)
        }
    })

    it("if update response returns a non-empty array of errors, execute updates should not queue download", async () => {
        const origin = "https://my-mamas-house.com"
        const cases = [
            ["err1"],
            ["err1", "err2"],
            ["err1", "err2", "err3"],
        ] as const
        for (const errors of cases) {
            const {client, downloadState} = createClient(origin, {
                cacheFiles: {},
                networkFiles: {}
            })
            expect(downloadState.queuedDownloads.length).toBe(0)
            const updateResponse = createUpdateCheck({
                status: Shabah.STATUS.ok,
                errors
            })
            const queueResponse = await client.executeUpdates(
                [updateResponse],
                "my update"
            )
            expect(queueResponse.ok).toBe(true)
            expect(queueResponse.data).toBe(Shabah.STATUS.updateImpossible)
            expect(downloadState.queuedDownloads.length).toBe(0)
        }
    })

    it("if update response is ok but new cargo is missing, execute updates should not queue download", async () => {
        const origin = "https://my-mamas-house.com"
        const {client, downloadState} = createClient(origin, {
            cacheFiles: {},
            networkFiles: {}
        })
        expect(downloadState.queuedDownloads.length).toBe(0)
        const updateResponse = createUpdateCheck({
            status: Shabah.STATUS.ok,
            newCargo: null
        })
        const queueResponse = await client.executeUpdates(
            [updateResponse],
            "my update"
        )
        expect(queueResponse.ok).toBe(true)
        expect(queueResponse.data).toBe(Shabah.STATUS.newCargoMissing)
        expect(downloadState.queuedDownloads.length).toBe(0)
        
    })

    it("if there is not enough disk storage for cargo, execute updates should not queue download", async () => {
        const origin = "https://my-mamas-house.com"
        const cases = [
            {
                storage: {used: 100, total: 200, left: 100},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 500}
                ]
            },
            {
                storage: {used: 100, total: 2_000, left: 1_900},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 500},
                    {requestUrl: `${origin}/style.css`, storageUrl: `${origin}/style.css`, bytes: 2_300},
                ]
            },
            {
                storage: {used: 0, total: 10, left: 10},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 2},
                    {requestUrl: `${origin}/style.css`, storageUrl: `${origin}/style.css`, bytes: 1},
                    {requestUrl: `${origin}/pic.png`, storageUrl: `${origin}/pic.png`, bytes: 8},
                ]
            },
        ]
        for (const {storage, downloadableResources} of cases) {
            const {client, downloadState} = createClient(origin, {
                cacheFiles: {},
                networkFiles: {}
            })
            expect(downloadState.queuedDownloads.length).toBe(0)
            const updateResponse = createUpdateCheck({
                status: Shabah.STATUS.ok,
                diskInfo: storage,
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
            expect(queueResponse.data).toBe(Shabah.STATUS.insufficentDiskSpace)
            expect(downloadState.queuedDownloads.length).toBe(0)
        }
    })

    it("if same cargo is already downloading, execute updates should not queue download", async () => {
        const origin = "https://my-mamas-house.com"
        const cases = [
            {
                storage: {used: 100, total: 20_000, left: 100},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 500}
                ]
            },
            {
                storage: {used: 100, total: 20_000, left: 1_900},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 500},
                    {requestUrl: `${origin}/style.css`, storageUrl: `${origin}/style.css`, bytes: 2_300},
                ]
            },
            {
                storage: {used: 0, total: 20_000, left: 10},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 2},
                    {requestUrl: `${origin}/style.css`, storageUrl: `${origin}/style.css`, bytes: 1},
                    {requestUrl: `${origin}/pic.png`, storageUrl: `${origin}/pic.png`, bytes: 8},
                ]
            },
        ]
        for (const {storage, downloadableResources} of cases) {
            const {client, downloadState} = createClient(origin, {
                cacheFiles: {},
                networkFiles: {}
            })
            expect(downloadState.queuedDownloads.length).toBe(0)
            const updateResponse = createUpdateCheck({
                status: Shabah.STATUS.ok,
                diskInfo: storage,
                newCargo: new Cargo(),
                originalNewCargoResponse: new Response(),
                
                    downloadableResources,
                    resourcesToDelete: []
                
            })
            await client.putDownloadIndex({
                id: updateResponse.id,
                previousId: "",
                bytes: 0,
                title: "update 1",
                segments: [
                    {
                        resolvedUrl: updateResponse.resolvedUrl,
                        canonicalUrl: updateResponse.canonicalUrl,
                        map: {},
                        version: "0.2.0",
                        previousVersion: "0.1.0",
                        bytes: 0,
                        resourcesToDelete: [],
                    }
                ]
            })
            const downloadIndexExists = !!(await client.getDownloadIndexByCanonicalUrl(
                updateResponse.canonicalUrl
            ))
            expect(downloadIndexExists).toBe(true)
            const queueResponse = await client.executeUpdates(
                [updateResponse],
                "my update"
            )
            expect(queueResponse.ok).toBe(true)
            expect(queueResponse.data).toBe(Shabah.STATUS.updateAlreadyQueued)
            expect(downloadState.queuedDownloads.length).toBe(0)
        }
    })

    it("if update is valid, execute updates should queue download", async () => {
        const origin = "https://my-mamas-house.com"
        const cases = [
            {
                storage: {used: 100, total: 20_000, left: 100},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 500}
                ]
            },
            {
                storage: {used: 100, total: 20_000, left: 1_900},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 500},
                    {requestUrl: `${origin}/style.css`, storageUrl: `${origin}/style.css`, bytes: 2_300},
                ]
            },
            {
                storage: {used: 0, total: 20_000, left: 10},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 2},
                    {requestUrl: `${origin}/style.css`, storageUrl: `${origin}/style.css`, bytes: 1},
                    {requestUrl: `${origin}/pic.png`, storageUrl: `${origin}/pic.png`, bytes: 8},
                ]
            },
        ]
        for (const {storage, downloadableResources} of cases) {
            const canonicalUrl = origin + "/"
            const {client, downloadState} = createClient(origin, {
                cacheFiles: {},
                networkFiles: {},
            })
            expect(downloadState.queuedDownloads.length).toBe(0)
            const updateResponse = createUpdateCheck({
                status: Shabah.STATUS.ok,
                id: "tmp",
                originalResolvedUrl: canonicalUrl,
                resolvedUrl: canonicalUrl,
                canonicalUrl,
                
                diskInfo: storage,
                newCargo: new Cargo(),
                originalNewCargoResponse: new Response(),
                
                    downloadableResources,
                    resourcesToDelete: []
                
            })
            const downloadIndexExists = !!(await client.getDownloadIndexByCanonicalUrl(
                updateResponse.canonicalUrl
            ))
            expect(downloadIndexExists).toBe(false)
            const queueResponse = await client.executeUpdates(
                [updateResponse],
                "my update"
            )
            expect(queueResponse.ok).toBe(true)
            expect(queueResponse.data).toBe(Shabah.STATUS.updateQueued)
            expect(downloadState.queuedDownloads.length).toBe(1)
            for (const {requestUrl} of downloadableResources) {
                const found = downloadState
                    .queuedDownloads[0]
                    .urls
                    .find((d) => d === requestUrl)
                expect(!!found).toBe(true)
            }
        }
    })

    it("if update is valid, a download and cargo index should be created, and cargo.json should be cached", async () => {
        const origin = "https://my-mamas-house.com"
        const ENTRY_NAME = "index.js"
        const cases = [
            {
                storage: {used: 100, total: 20_000, left: 100},
                downloadableResources: [
                    {requestUrl: `${origin}/${ENTRY_NAME}`, storageUrl: `${origin}/${ENTRY_NAME}`, bytes: 500}
                ]
            },
            {
                storage: {used: 100, total: 20_000, left: 1_900},
                downloadableResources: [
                    {requestUrl: `${origin}/${ENTRY_NAME}`, storageUrl: `${origin}/${ENTRY_NAME}`, bytes: 500},
                    {requestUrl: `${origin}/style.css`, storageUrl: `${origin}/style.css`, bytes: 2_300},
                ]
            },
            {
                storage: {used: 0, total: 20_000, left: 10},
                downloadableResources: [
                    {requestUrl: `${origin}/${ENTRY_NAME}`, storageUrl: `${origin}/${ENTRY_NAME}`, bytes: 2},
                    {requestUrl: `${origin}/style.css`, storageUrl: `${origin}/style.css`, bytes: 1},
                    {requestUrl: `${origin}/pic.png`, storageUrl: `${origin}/pic.png`, bytes: 8},
                ]
            },
        ]
        for (const {storage, downloadableResources} of cases) {
            const canonicalUrl = origin + "/"
            const {client, downloadState, caches: {innerFileCache}} = createClient(origin, {
                cacheFiles: {},
                networkFiles: {},
            })
            expect(downloadState.queuedDownloads.length).toBe(0)
            const updateResponse = createUpdateCheck({
                status: Shabah.STATUS.ok,
                
                    id: "tmp",
                    originalResolvedUrl: canonicalUrl,
                    resolvedUrl: canonicalUrl,
                    canonicalUrl,
                
                diskInfo: storage,
                newCargo: new Cargo({entry: "index.js"}),
                originalNewCargoResponse: new Response(),
                
                    downloadableResources,
                    resourcesToDelete: []
                
            })
            const downloadIndexExists = !!(await client.getDownloadIndexByCanonicalUrl(
                updateResponse.canonicalUrl
            ))
            expect(downloadIndexExists).toBe(false)
            const queueResponse = await client.executeUpdates(
                [updateResponse],
                "my update"
            )
            expect(!!(await client.getDownloadIndexByCanonicalUrl(
                updateResponse.canonicalUrl
            ))).toBe(true)
            const cargoIndex = await client.getCargoIndexByCanonicalUrl(
                updateResponse.canonicalUrl
            )
            expect(!!cargoIndex).toBe(true)
            expect(cargoIndex?.state).toBe("updating")
            expect(cargoIndex?.entry).toBe(updateResponse.resolvedUrl + ENTRY_NAME)
            expect(!!(innerFileCache.getFile(
                updateResponse.resolvedUrl + MANIFEST_NAME
            ))).toBe(true)
            expect(queueResponse.ok).toBe(true)
            expect(queueResponse.data).toBe(Shabah.STATUS.updateQueued)
            expect(downloadState.queuedDownloads.length).toBe(1)
        }
    })

    it(`if saved cargo has an entry of "${NULL_FIELD}", generated cargo index entry should also be "${NULL_FIELD}"`, async () => {
        const origin = "https://my-mamas-house.com"
        const cases = [
            {
                storage: {used: 100, total: 20_000, left: 100},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 500}
                ],
            },
            {
                storage: {used: 100, total: 20_000, left: 1_900},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 500},
                    {requestUrl: `${origin}/style.css`, storageUrl: `${origin}/style.css`, bytes: 2_300},
                ]
            },
            {
                storage: {used: 0, total: 20_000, left: 10},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 2},
                    {requestUrl: `${origin}/style.css`, storageUrl: `${origin}/style.css`, bytes: 1},
                    {requestUrl: `${origin}/pic.png`, storageUrl: `${origin}/pic.png`, bytes: 8},
                ]
            },
        ]
        for (const {storage, downloadableResources} of cases) {
            const canonicalUrl = origin + "/"
            const {client, downloadState, caches: {innerFileCache}} = createClient(origin, {
                cacheFiles: {},
                networkFiles: {},
            })
            expect(downloadState.queuedDownloads.length).toBe(0)
            const updateResponse = createUpdateCheck({
                status: Shabah.STATUS.ok,
                
                    id: "tmp",
                    originalResolvedUrl: canonicalUrl,
                    resolvedUrl: canonicalUrl,
                    canonicalUrl,
                
                diskInfo: storage,
                newCargo: new Cargo({entry: NULL_FIELD}),
                originalNewCargoResponse: new Response(),
                
                    downloadableResources,
                    resourcesToDelete: []
                
            })
            const downloadIndexExists = !!(await client.getDownloadIndexByCanonicalUrl(
                updateResponse.canonicalUrl
            ))
            expect(downloadIndexExists).toBe(false)
            const queueResponse = await client.executeUpdates(
                [updateResponse],
                "my update"
            )
            const cargoIndex = await client.getCargoIndexByCanonicalUrl(
                updateResponse.canonicalUrl
            )
            expect(!!cargoIndex).toBe(true)
            expect(cargoIndex?.state).toBe("updating")
            expect(cargoIndex?.entry).toBe(NULL_FIELD)
            expect(queueResponse.ok).toBe(true)
            expect(queueResponse.data).toBe(Shabah.STATUS.updateQueued)
            expect(downloadState.queuedDownloads.length).toBe(1)
        }
    })

    it(`files that are scheduled for deletion should be deleted`, async () => {
        const origin = "https://my-mamas-house.com"
        const cases = [
            {
                storage: {used: 100, total: 20_000, left: 100},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 500}
                ],
                resourcesToDelete: [
                    {requestUrl: `${origin}/delete1.js`, storageUrl: `${origin}/delete1.js`, bytes: 500},
                ]
            },
            {
                storage: {used: 100, total: 20_000, left: 1_900},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 500},
                    {requestUrl: `${origin}/style.css`, storageUrl: `${origin}/style.css`, bytes: 2_300},
                ],
                resourcesToDelete: [
                    {requestUrl: `${origin}/delete1.js`, storageUrl: `${origin}/delete1.js`, bytes: 500},
                    {requestUrl: `${origin}/delete2.css`, storageUrl: `${origin}/delete2.css`, bytes: 500},
                ]
            },
            {
                storage: {used: 0, total: 20_000, left: 10},
                downloadableResources: [
                    {requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 2},
                    {requestUrl: `${origin}/style.css`, storageUrl: `${origin}/style.css`, bytes: 1},
                    {requestUrl: `${origin}/pic.png`, storageUrl: `${origin}/pic.png`, bytes: 8},
                ],
                resourcesToDelete: [
                    {requestUrl: `${origin}/delete1.js`, storageUrl: `${origin}/delete1.js`, bytes: 500},
                    {requestUrl: `${origin}/delete2.css`, storageUrl: `${origin}/delete2.css`, bytes: 500},
                    {requestUrl: `${origin}/delete3.png`, storageUrl: `${origin}/delete3.png`, bytes: 500},
                ]
            },
        ]
        for (const {storage, downloadableResources, resourcesToDelete} of cases) {
            const canonicalUrl = origin + "/"
            const {client, downloadState, caches: {innerFileCache}} = createClient(origin, {
                cacheFiles: {},
                networkFiles: {},
            })
            expect(downloadState.queuedDownloads.length).toBe(0)
            const updateResponse = createUpdateCheck({
                status: Shabah.STATUS.ok,
                id: "tmp",
                originalResolvedUrl: canonicalUrl,
                resolvedUrl: canonicalUrl,
                canonicalUrl,
                diskInfo: storage,
                newCargo: new Cargo(),
                originalNewCargoResponse: new Response(),
                downloadableResources,
                resourcesToDelete
            })
            const downloadIndexExists = !!(await client.getDownloadIndexByCanonicalUrl(
                updateResponse.canonicalUrl
            ))
            expect(downloadIndexExists).toBe(false)
            const queueResponse = await client.executeUpdates(
                [updateResponse],
                "my update"
            )
            expect(queueResponse.ok).toBe(true)
            expect(queueResponse.data).toBe(Shabah.STATUS.updateQueued)
            expect(downloadState.queuedDownloads.length).toBe(1)
            for (const {storageUrl} of resourcesToDelete) {
                const found = innerFileCache.accessLog.find(
                    (log) => log.action === "delete" && log.url === storageUrl
                )
                expect(!!found).toBe(true)
            }
        }
    })

    it(`multiple updates can be merged into one`, async () => {
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
            const {client, downloadState, caches: {innerFileCache}} = downloadClient
            expect(downloadState.queuedDownloads.length).toBe(0)
            const updateResponses = []
            for (const {origin, storage, downloadableResources, resourcesToDelete} of testCase) {
                const canonicalUrl = origin + "/"
                const response = createUpdateCheck({
                    status: Shabah.STATUS.ok,
                    id: "tmp",
                    originalResolvedUrl: canonicalUrl,
                    resolvedUrl: canonicalUrl,
                    canonicalUrl,
                    diskInfo: storage,
                    newCargo: new Cargo(),
                    originalNewCargoResponse: new Response(),
                    downloadableResources,
                    resourcesToDelete
                })
                updateResponses.push(response)
                const downloadIndexExists = !!(await client.getDownloadIndexByCanonicalUrl(
                    response.canonicalUrl
                ))
                expect(downloadIndexExists).toBe(false)
            }
            const queueResponse = await client.executeUpdates(
                updateResponses,
                "my update"
            )
            expect(queueResponse.ok).toBe(true)
            expect(queueResponse.data).toBe(Shabah.STATUS.updateQueued)
            expect(downloadState.queuedDownloads.length).toBe(1)
            
            for (const {origin, resourcesToDelete, downloadableResources} of testCase) {
                const foundCargo = await client.getCargoIndexByCanonicalUrl(
                    origin + "/"
                )
                expect(!!foundCargo).toBe(true)
                expect(foundCargo?.state).toBe("updating")
                const downloadId = downloadState.queuedDownloads[0].id
                expect(foundCargo?.downloadQueueId).toBe(downloadId)

                const foundDownloadIndex = await client.getDownloadIndexByCanonicalUrl(
                    origin + "/"
                )
                expect(!!foundDownloadIndex).toBe(true)
                expect(foundDownloadIndex?.id).toBe(downloadId)

                const cargoSaved = innerFileCache.getFile(
                    origin + "/" + MANIFEST_NAME
                )
                expect(!!cargoSaved).toBe(true)

                for (const {requestUrl} of downloadableResources) {
                    const queued = downloadState.queuedDownloads[0].urls
                    const found = queued.find((url) => url === requestUrl)
                    expect(!!found).toBe(true)
                }

                for (const {storageUrl} of resourcesToDelete) {
                    const found = innerFileCache.accessLog.find(
                        (log) => log.action === "delete" && log.url === storageUrl
                    )
                    expect(!!found).toBe(true)
                }
            }
        }
    })

    it(`if no downloadable resources are found, download should not be queued`, async () => {
        const mainOrigin = "https://my-mamas-house.com"
        const origins = [
            "https://papashouse.com",
            "https://mamashouse.com"
        ] as const
        const tests = [
            [
                {
                    resourcesToDelete: [
                        {requestUrl: `${origins[0]}/delete1.js`, storageUrl: `${origins[0]}/delete1.js`, bytes: 500},
                    ],
                    origin: origins[0]
                },
                {
                    resourcesToDelete: [
                        {requestUrl: `${origins[1]}/delete1.js`, storageUrl: `${origins[1]}/delete1.js`, bytes: 500},
                        {requestUrl: `${origins[1]}/delete2.css`, storageUrl: `${origins[1]}/delete2.css`, bytes: 500},
                    ],
                    origin: origins[1]
                },
            ],
        ]
        for (const test of tests) {
            const downloadClient = createClient(mainOrigin, {
                cacheFiles: {},
                networkFiles: {},
            })
            const {client, downloadState, caches: {innerFileCache}} = downloadClient
            expect(downloadState.queuedDownloads.length).toBe(0)
            const updateResponses = []
            
            for (const {origin, resourcesToDelete} of test) {
                const canonicalUrl = origin + "/"
                const response = createUpdateCheck({
                    status: Shabah.STATUS.ok,
                    id: "tmp",
                    originalResolvedUrl: canonicalUrl,
                    resolvedUrl: canonicalUrl,
                    canonicalUrl,
                    diskInfo: {used: 100, total: 20_000, left: 19_900},
                    newCargo: new Cargo(),
                    originalNewCargoResponse: new Response(),
                    downloadableResources: [],
                    resourcesToDelete
                })
                updateResponses.push(response)
                const downloadIndexExists = !!(await client.getDownloadIndexByCanonicalUrl(
                    response.canonicalUrl
                ))
                expect(downloadIndexExists).toBe(false)
            }

            const queueResponse = await client.executeUpdates(
                updateResponses,
                "my update"
            )
            expect(queueResponse.ok).toBe(true)
            expect(queueResponse.data).toBe(Shabah.STATUS.noDownloadbleResources)
            expect(downloadState.queuedDownloads.length).toBe(0)

            for (const {resourcesToDelete, origin} of test) {
                const canonicalUrl = origin + "/"
                const downloadIndex = await client.getDownloadIndexByCanonicalUrl(
                    canonicalUrl
                )
                expect(downloadIndex).toBe(null)
                const cargoIndex = await client.getCargoIndexByCanonicalUrl(
                    canonicalUrl
                )
                expect(cargoIndex).not.toBe(null)
                expect(cargoIndex?.downloadQueueId).toBe(NO_UPDATE_QUEUED)
                
                for (const {storageUrl} of resourcesToDelete) {
                    const deleteRequest = innerFileCache.accessLog.find(
                        (log) => log.action === "delete" && log.url === storageUrl
                    )
                    expect(!!deleteRequest).toBe(true)
                }
            }
        }
    })
})

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
                expect(queueResponse.data).toBe(Shabah.STATUS.notFound)
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
                expect(cargoIndexFound?.state).toBe("cached")
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
                    {state: "update-failed"}
                )
                await client.putCargoIndex(cargoIndex)
                const cargoIndexFound = await client.getCargoIndexByCanonicalUrl(
                    canonicalUrl
                )
                expect(!!cargoIndexFound).toBe(true)
                expect(cargoIndexFound?.state).toBe("update-failed")
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
                    {state: "update-failed"}
                )
                await client.putCargoIndex(cargoIndex)
                const cargoIndexFound = await client.getCargoIndexByCanonicalUrl(
                    canonicalUrl
                )
                expect(!!cargoIndexFound).toBe(true)
                expect(cargoIndexFound?.state).toBe("update-failed")
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
                expect(cargoIndexFoundAfterMutation?.state).toBe("updating")
                expect(cargoIndexFoundAfterMutation?.downloadQueueId).toBe(downloadState.queuedDownloads[0].id)
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
                    {state: "update-failed"}
                )
                await client.putCargoIndex(cargoIndex)
                const cargoIndexFound = await client.getCargoIndexByCanonicalUrl(
                    canonicalUrl
                )
                expect(!!cargoIndexFound).toBe(true)
                expect(cargoIndexFound?.state).toBe("update-failed")
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
                    expect(cargoIndexFoundAfterMutation?.state).toBe("updating")
                    expect(cargoIndexFoundAfterMutation?.downloadQueueId).toBe(downloadState.queuedDownloads[0].id)
                    const errorIndexAfterMutation = await getErrorDownloadIndex(
                        resolvedUrl, adaptors.fileCache
                    )
                    expect(!!errorIndexAfterMutation).toBe(false)
                }
            }
            
        }
    })
})

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
            id: "tmp",
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
            cargoStorageBytes: 100
        })
        await client.executeUpdates([updateResponse], "update")
        const foundInitial = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!foundInitial).toBe(true)
        expect(foundInitial?.downloadQueueId).not.toBe(NO_UPDATE_QUEUED)
        expect(foundInitial?.state).toBe("updating")
        
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
            id: "tmp",
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
            cargoStorageBytes: 100
        })
        const secondUpdate = createUpdateCheck({
            id: "tmp",
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
            cargoStorageBytes: 100
        })
        await client.executeUpdates(
            [updateResponse, secondUpdate], "update"
        )
        const foundInitial = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!foundInitial).toBe(true)
        expect(foundInitial?.downloadQueueId).not.toBe(NO_UPDATE_QUEUED)
        expect(foundInitial?.state).toBe("updating")

        const foundInitialSecond = await client.getCargoIndexByCanonicalUrl(
            secondCanonicalUrl
        )
        expect(!!foundInitialSecond).toBe(true)
        expect(foundInitialSecond?.downloadQueueId || "none2").toBe(foundInitial?.downloadQueueId || "none1")
        expect(foundInitialSecond?.state).toBe("updating")

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
        expect(deleteReponse).toBe(Shabah.STATUS.notFound)
        const afterDelete = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(!!afterDelete).toBe(true)
    })

    it("calling delete cargo on a particular cargo should delete cargo index and all associated files", async () => {
        const origin = "https://mymamashouse.com"
        const canonicalUrl = origin + "/"
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
                resolvedUrl: canonicalUrl
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
        expect(response.data).toBe(Shabah.STATUS.notFound)
    })
})

describe("finding full cargos", () => {
    it("if cargo is not found an error should be returned", async () => {
        const origin = "https://a-new-website-.com"
        const resolvedUrl = origin + "/"
        const {client} = createClient(origin, {
            cacheFiles: {}
        })
        const response = await client.getCargoAtUrl(resolvedUrl)
        expect(response.ok).toBe(false)
        expect(response.data).toBe(null)
    })

    it("if cargo is found but is not json encoded an error should be returned", async () => {
        const origin = "https://a-new-website-.com"
        const resolvedUrl = origin + "/"
        const cargo = "{"
        const {client} = createClient(origin, {
            cacheFiles: {
                [`${resolvedUrl}${MANIFEST_NAME}`]: () => {
                    return new Response(cargo, {
                        status: 200
                    })
                }
            }
        })
        const response = await client.getCargoAtUrl(resolvedUrl)
        expect(response.ok).toBe(false)
        expect(response.data).toBe(null)
    })

    it("if cargo is found and is valid, a parsed version should be returned", async () => {
        const origin = "https://a-new-website-.com"
        const resolvedUrl = origin + "/"
        const cargo = new Cargo({name: "good cargo"})
        const {client} = createClient(origin, {
            cacheFiles: {
                [`${resolvedUrl}${MANIFEST_NAME}`]: () => {
                    return new Response(JSON.stringify(cargo), {
                        status: 200
                    })
                }
            }
        })
        const response = await client.getCargoAtUrl(resolvedUrl)
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
            const id = "dl-" + Math.trunc(Math.random() * 1_000)
            const updateResponse = createUpdateCheck({
                id,
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
            expect(state?.id || "1").toBe(cargoIndex?.downloadQueueId || "2")
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