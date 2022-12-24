import {describe, it, expect} from "vitest"
import {checkForUpdates} from "./client"
import {FetchFunction} from "./shared"
import {ResultType, io} from "../monads/result"
import {CodeManifestSafe} from "../cargo/index"
import {LATEST_CRATE_VERSION} from "../cargo/consts"
import {nanoid} from "nanoid"

type FileRecord = Record<string, () => ResultType<Response>>
const requester = (files: FileRecord) => {
    const fileFetcher: FetchFunction = async (input) => {
        const url = ((i: typeof input) => {
            return i instanceof URL 
                ? i.href
                : i instanceof Request ? i.url : i
        })(input)
        const file = files[url]
        if (file) {
            try {
                const f = file()
                if (!f.ok) {
                    throw("should never be here!!")
                }
                return f.data 
            } catch (err) {
                return new Response(String(err), {
                    status: 400,
                    statusText: "BAD REQUEST"
                })
            }
        }
        return new Response("", {
            status: 404,
            statusText: "NOT FOUND"
        })
    }
    return fileFetcher
}

const cargoPkg = new CodeManifestSafe({
    uuid: nanoid(CodeManifestSafe.UUID_LENGTH), 
    crateVersion: LATEST_CRATE_VERSION,
    version: "0.1.0", 
    name: "test-pkg", 
    entry: "index.js", 
    files: [{name: "index.js", bytes: 1_000}]
})

describe("diff cargos function", () => {
    it("if storage url request encounters fatal error no update urls are returned", async () => {
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                throw new Error("old cargo network error")
            }
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
    })

    it("if cargo has not been downloaded before and new cargo cannot be fetched due to network error no download urls should be returned", async () => {
        const fileFetcher = requester({
            "https://mywebsite.com/pkg/cargo.json": () => {
                throw new Error("new cargo network error")
            }
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
    })

    it("if cargo has not been downloaded before and new cargo cannot be fetched because http error occurred no download urls should be returned", async () => {
        const fileFetcher = requester({
            "https://mywebsite.com/pkg/cargo.json": () => {
                return io.ok(new Response("", {
                    status: 404,
                    statusText: "NOT FOUND"
                }))
            }
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
    })

    it("if cargo has not been downloaded before and new cargo is found but is not json-encoded no download urls should be returned", async () => {
        const fileFetcher = requester({
            "https://mywebsite.com/pkg/cargo.json": () => {
                const invalidJson = "{"
                return io.ok(new Response(invalidJson, {
                    status: 200,
                    statusText: "OK"
                }))
            }
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
    })

    it("if cargo has not been downloaded before and new cargo is found but is not a valid cargo.json no download urls should be returned", async () => {
        const fileFetcher = requester({
            "https://mywebsite.com/pkg/cargo.json": () => {
                const invalidCargo = `{"random-key": 2}`
                return io.ok(new Response(invalidCargo, {
                    status: 200,
                    statusText: "OK"
                }))
            }
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
    })

    it("if cargo has not been downloaded before and new cargo is found new cargo file urls should be returned", async () => {
        const manifest = cargoPkg.clone()
        const cargoString = JSON.stringify(manifest)
        
        const fileFetcher = requester({
            "https://mywebsite.com/pkg/cargo.json": () => {
                return io.ok(new Response(cargoString, {
                    status: 200,
                    statusText: "OK"
                }))
            }
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.downloadableResources.length).toBe(manifest.files.length)
        expect(res.errors.length).toBe(0)
        expect(res.resoucesToDelete.length).toBe(0)
        expect(res.bytesToDownload).toBeGreaterThan(0)
        expect(res.newCargo?.storageUrl).toBe(
            "https://local.com/store/cargo.json"
        )
        expect(res.newCargo?.text).toBe(cargoString)
        expect(res.previousVersionExists).toBe(false)
    })

    it("if previous cargo responds with error http that is not 404 should return no update urls", async () => {
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                return io.ok(new Response("", {
                    status: 403,
                    statusText: "FORBIDDEN"
                }))
            }
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
    })

    it("if previous cargo is found and new mini cargo version is not greater, no download urls should be returned and full new cargo should not be requested", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const requestRecord = {
            newCargoMini: 0,
            newCargo: 0
        }
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.mini.json": () => {
                requestRecord.newCargoMini++
                const pkg = JSON.stringify(newCargo.toMini())
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                requestRecord.newCargo++
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBe(0)
        expect(requestRecord.newCargoMini).toBeGreaterThan(0)
        expect(requestRecord.newCargo).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and fetching new mini cargo version cannot be fetched due to network error, full new cargo should be fetched as a fallback", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const requestRecord = {
            newCargoMini: 0,
            newCargo: 0
        }
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.mini.json": () => {
                requestRecord.newCargoMini++
                throw new Error("network error")
                const pkg = JSON.stringify(newCargo.toMini())
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                requestRecord.newCargo++
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(requestRecord.newCargoMini).toBeGreaterThan(0)
        expect(requestRecord.newCargo).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and fetching new mini cargo version cannot be fetched due to error http code returned, full new cargo should be fetched as a fallback", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const requestRecord = {
            newCargoMini: 0,
            newCargo: 0
        }
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.mini.json": () => {
                requestRecord.newCargoMini++
                return io.ok(new Response("", {
                    status: 403,
                    statusText: "FORBIDDEN"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                requestRecord.newCargo++
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(requestRecord.newCargoMini).toBeGreaterThan(0)
        expect(requestRecord.newCargo).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and fetching new cargo returns network error, no download links should be returned", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                throw new Error("network error")
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and fetching new cargo returns http error, no download links should be returned", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 500,
                    statusText: "INTERNAL SERVER ERROR"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and new cargo is not json encoded, no download links should be returned", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                // ruin the json encoding
                const pkg = JSON.stringify(newCargo) + "{"
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and new cargo is not a valid cargo json, no download links should be returned", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                const pkg = JSON.stringify({})
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and new cargo version is not greater, no download links and errors should be returned", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.errors.length).toBe(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and new cargo version is greater, download links not found in previous cargo, download links that are expired, and no errors should be returned", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "0.1.2"
        const expiredResources = [
            {name: "perf.3.wasm", bytes: 20_000, invalidation: "default"}
        ] as const
        oldCargo.files.push(...expiredResources)
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.3"
        const newResources = [
            {name: "rand.5.js", bytes: 600, invalidation: "default"},
            {name: "styles.6.css", bytes: 1_100, invalidation: "default"},
        ] as const
        newCargo.files.push(...newResources)
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.errors.length).toBe(0)
        expect(res.downloadableResources.length).toBe(
            newResources.length
        )
        expect(res.resoucesToDelete.length).toBe(
            expiredResources.length
        )
        const cargoString = JSON.stringify(newCargo)
        expect(res.newCargo?.storageUrl).toBe("https://local.com/store/cargo.json")
        expect(res.newCargo?.text).toBe(cargoString)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and new cargo uuid mismatches old cargo's, no download links and errors should return", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "0.1.2"
        const expiredResources = [
            {name: "perf.3.wasm", bytes: 20_000, invalidation: "default"}
        ] as const
        oldCargo.files.push(...expiredResources)
        const newCargo = cargoPkg.clone()
        newCargo.uuid = nanoid(CodeManifestSafe.UUID_LENGTH)
        newCargo.version = "0.1.3"
        const newResources = [
            {name: "rand.5.js", bytes: 600, invalidation: "default"},
            {name: "styles.6.css", bytes: 1_100, invalidation: "default"},
        ] as const
        newCargo.files.push(...newResources)
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, {
            getFile: (url) => fileFetcher(url, {}),
            putFile: async () => true,
            queryUsage: async () => ({usage: 0, quota: 0}),
            deleteFile: async () => true
        })
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })
})

import {
    getDownloadIndices,
    updateDownloadIndex,
    emptyDownloadIndex,
    operationCodes,
    removeDownloadIndex,
    saveDownloadIndices
} from "./shared"

const createFileCache = (initFiles: Record<string, Response>) => {
    const cache = {
        getFile: async (url: string) => initFiles[url],
        putFile: async (url: string, file: Response) => { 
            initFiles[url] = file 
            return true
        },
        queryUsage: async () => ({usage: 0, quota: 0}),
        deleteFile: async () => true
    }
    return cache
}

describe("reading and writing to download index", () => {
    it("if download index collection hasn't been created yet, should return empty index", async () => {
        const fileCache = createFileCache({})
        const index = await getDownloadIndices(
            "/__dl-index__.json",
            fileCache
        )
        expect(!!index.downloads).toBe(true)
        expect(!!index.updatedAt).toBe(true)
        expect(!!index.createdAt).toBe(true)
    })

    it("if download index is not in index collection new index should be created", () => {
        const index = emptyDownloadIndex()
        expect(index.downloads.length).toBe(0)
        const res = updateDownloadIndex(
            index,
            {id: "pkg", title: "none", map: {}, bytes: 0, version: "0.1.0", previousVersion: "none"}
        )
        expect(index.downloads.length).toBe(1)
        expect(res).toBe(operationCodes.createdNew)
    })

    it("if download index is not in index collection download index total bytes should be incremented", () => {
        const index = emptyDownloadIndex()
        expect(index.downloads.length).toBe(0)
        expect(index.totalBytes).toBe(0)
        const bytes = 10
        const res = updateDownloadIndex(
            index,
            {id: "pkg", title: "none", map: {}, bytes, version: "0.1.0", previousVersion: "none"}
        )
        expect(index.totalBytes).toBe(bytes)
        expect(index.downloads.length).toBe(1)
        expect(res).toBe(operationCodes.createdNew)
    })

    it("if download index is in index collection new index should overwrite old", () => {
        const index = emptyDownloadIndex()
        updateDownloadIndex(
            index,
            {id: "pkg", title: "none", map: {}, bytes: 0, version: "0.1.0", previousVersion: "none"}
        )
        expect(index.downloads.length).toBe(1)
        const res = updateDownloadIndex(
            index,
            {id: "pkg", title: "none", map: {}, bytes: 1, version: "0.2.0", previousVersion: "0.1.0"}
        )
        expect(index.downloads.length).toBe(1)
        expect(index.downloads.find((d) => d.id === "pkg")?.bytes).toBe(1)
        expect(res).toBe(operationCodes.updatedExisting)
    })

    it("if download index is in index collection download index total bytes should be be incremented by the bytes difference between the two", async () => {
        const fileCache = createFileCache({})
        const origin = "https://a-cool-place.site"
        const index = await getDownloadIndices(origin, fileCache)
        updateDownloadIndex(
            index,
            {id: "pkg", title: "none", map: {}, bytes: 20, version: "0.1.0", previousVersion: "none"}
        )
        updateDownloadIndex(
            index,
            {id: "pkg-2", title: "none", map: {}, bytes: 50, version: "0.1.0", previousVersion: "none"}
        )
        const res = await saveDownloadIndices(index, origin, fileCache)
        expect(res).toBe(operationCodes.saved)
        expect(
            JSON.stringify(await getDownloadIndices(origin, fileCache))
        ).toEqual(JSON.stringify(index))
    })

    it("if download index is in index collection download index total bytes should be be incremented by the bytes difference between the two, even if origin has a trailing slash", async () => {
        const fileCache = createFileCache({})
        const origin = "https://a-cool-place.site/"
        const index = await getDownloadIndices(origin, fileCache)
        updateDownloadIndex(
            index,
            {id: "pkg", title: "none", map: {}, bytes: 20, version: "0.1.0", previousVersion: "none"}
        )
        updateDownloadIndex(
            index,
            {id: "pkg-2", title: "none", map: {}, bytes: 50, version: "0.1.0", previousVersion: "none"}
        )
        const res = await saveDownloadIndices(index, origin, fileCache)
        expect(res).toBe(operationCodes.saved)
        expect(
            JSON.stringify(await getDownloadIndices(origin, fileCache))
        ).toEqual(JSON.stringify(index))
    })

    it("if remove download index is called with an existing id, index with id should be removed and download collection bytes should be decremented by the amount of bytes in the removed index", () => {
        const index = emptyDownloadIndex()
        expect(index.totalBytes).toBe(0)
        updateDownloadIndex(
            index,
            {id: "pkg", title: "none", map: {}, bytes: 20, version: "0.1.0", previousVersion: "none"}
        )
        updateDownloadIndex(
            index,
            {id: "pkg-2", title: "none", map: {}, bytes: 50, version: "0.1.0", previousVersion: "none"}
        )
        expect(index.totalBytes).toBe(70)
        const res = removeDownloadIndex(index, "pkg")
        expect(index.totalBytes).toBe(50)
        expect(index.downloads.length).toBe(1)
        expect(res).toBe(operationCodes.removed)
    })

    it("if remove download index is called with an non existing id, nothing should occur", () => {
        const index = emptyDownloadIndex()
        expect(index.totalBytes).toBe(0)
        updateDownloadIndex(
            index,
            {id: "pkg", title: "none", map: {}, bytes: 20, version: "0.1.0", previousVersion: "none"}
        )
        updateDownloadIndex(
            index,
            {id: "pkg-2", title: "none", map: {}, bytes: 50, version: "0.1.0", previousVersion: "none"}
        )
        expect(index.totalBytes).toBe(70)
        const res = removeDownloadIndex(index, "random-pkg")
        expect(index.totalBytes).toBe(70)
        expect(index.downloads.length).toBe(2)
        expect(res).toBe(operationCodes.notFound)
    })

    it("saved download indices should be able to be fetched with the getDownloadIndices function", () => {
        const index = emptyDownloadIndex()
        expect(index.totalBytes).toBe(0)
        updateDownloadIndex(
            index,
            {id: "pkg", title: "none", map: {}, bytes: 20, version: "0.1.0", previousVersion: "none"}
        )
        updateDownloadIndex(
            index,
            {id: "pkg-2", title: "none", map: {}, bytes: 50, version: "0.1.0", previousVersion: "none"}
        )
        expect(index.totalBytes).toBe(70)
        const res = removeDownloadIndex(index, "random-pkg")
        expect(index.totalBytes).toBe(70)
        expect(index.downloads.length).toBe(2)
        expect(res).toBe(operationCodes.notFound)
    })
})

import {
    getCargoIndices,
    emptyCargoIndices,
    updateCargoIndex,
    saveCargoIndices,
} from "./shared"
import { json } from "stream/consumers"
import { exec } from "child_process"

describe("reading and writing to cargo indices", () => {
    it("should return empty cargo indices if one is not found", async () => {
        const fileFetcher = createFileCache({})
        const index = await getCargoIndices(
            "https://myhouse.com",
            fileFetcher
        )
        expect(!!index.cargos).toBe(true)
        expect(!!index.updatedAt).toBe(true)
        expect(!!index.createdAt).toBe(true)
    })

    it("if download index is not in index collection new index should be created", () => {
        const index = emptyCargoIndices()
        expect(index.cargos.length).toBe(0)
        const res = updateCargoIndex(
            index,
            {
                id: "pkg",
                name: "pkg",
                state: "updating",
                version: "0.1.0",
                bytes: 0,
                entry: "store/index.js",
                storageRootUrl: "store/",
                requestRootUrl: "store/",
            }
        )
        expect(index.cargos.length).toBe(1)
        expect(res).toBe(operationCodes.createdNew)
    })

    it("if cargo index is not in index collection new index should be created", () => {
        const index = emptyCargoIndices()
        const first = {
            id: "pkg",
            name: "pkg",
            state: "updating",
            version: "0.1.0",
            bytes: 0,
            entry: "store/index.js",
            storageRootUrl: "store/",
            requestRootUrl: "store/",
        } as const
        updateCargoIndex(index, first)
        expect(index.cargos.length).toBe(1)
        const second = {
            id: "pkg",
            name: "pkg",
            state: "cached",
            version: "0.2.0",
            bytes: 0,
            entry: "store/index.js",
            storageRootUrl: "store/",
            requestRootUrl: "store/",
        } as const
        const res = updateCargoIndex(index, second)
        expect(index.cargos.length).toBe(1)
        expect(index.cargos[0].version).toBe("0.2.0")
        expect(res).toBe(operationCodes.updatedExisting)
    })

    it("saved cargo indices should be able to be fetched with the get download indices function", async () => {
        const fileCache = createFileCache({})
        const origin = "https://myhouse.com"
        const index = await getCargoIndices(origin, fileCache)
        const first = {
            id: "pkg",
            name: "pkg",
            state: "updating",
            version: "0.1.0",
            bytes: 0,
            entry: "store/index.js",
            storageRootUrl: "store/",
            requestRootUrl: "store/",
        } as const
        updateCargoIndex(index, first)
        const second = {
            id: "pkg-2",
            name: "pkg",
            state: "cached",
            version: "0.2.0",
            bytes: 0,
            entry: "store/index.js",
            storageRootUrl: "store/",
            requestRootUrl: "store/",
        } as const
        updateCargoIndex(index, second)
        expect(index.cargos.length).toBe(2)
        const res = await saveCargoIndices(
            index, origin, fileCache
        )
        expect(res).toBe(operationCodes.saved)
        const indexAgain = await getCargoIndices(origin, fileCache)
        expect(JSON.stringify(indexAgain)).toEqual(JSON.stringify(index))
    })

    it("saved cargo indices should be able to be fetched with the get download indices function even when origin has a trailing slash", async () => {
        const fileCache = createFileCache({})
        const origin = "https://myhouse.com/"
        const index = await getCargoIndices(origin, fileCache)
        const first = {
            id: "pkg",
            name: "pkg",
            state: "updating",
            version: "0.1.0",
            bytes: 0,
            entry: "store/index.js",
            storageRootUrl: "store/",
            requestRootUrl: "store/",
        } as const
        updateCargoIndex(index, first)
        const second = {
            id: "pkg-2",
            name: "pkg",
            state: "cached",
            version: "0.2.0",
            bytes: 0,
            entry: "store/index.js",
            storageRootUrl: "store/",
            requestRootUrl: "store/",
        } as const
        updateCargoIndex(index, second)
        expect(index.cargos.length).toBe(2)
        const res = await saveCargoIndices(
            index, origin, fileCache
        )
        expect(res).toBe(operationCodes.saved)
        const indexAgain = await getCargoIndices(origin, fileCache)
        expect(JSON.stringify(indexAgain)).toEqual(JSON.stringify(index))
    })
})