import {expect, describe, it} from "vitest"

import {
    getDownloadIndices,
    updateDownloadIndex,
    emptyDownloadIndex,
    operationCodes,
    removeDownloadIndex,
    saveDownloadIndices,
    Permissions
} from "./backend"

const createFileCache = (initFiles: Record<string, Response>) => {
    const cache = {
        getFile: async (url: string) => initFiles[url],
        putFile: async (url: string, file: Response) => { 
            initFiles[url] = file 
            return true
        },
        queryUsage: async () => ({usage: 0, quota: 0}),
        deleteFile: async () => true,
        deleteAllFiles: async () => true,
        isPersisted: async () => true,
        requestPersistence: async () => true,
        listFiles: async () => [],
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
            {id: "pkg", title: "none", map: {}, bytes: 0, version: "0.1.0", previousVersion: "none", resolvedUrl: ""}
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
            {id: "pkg", title: "none", map: {}, bytes, version: "0.1.0", previousVersion: "none", resolvedUrl: ""}
        )
        expect(index.totalBytes).toBe(bytes)
        expect(index.downloads.length).toBe(1)
        expect(res).toBe(operationCodes.createdNew)
    })

    it("if download index is in index collection new index should overwrite old", () => {
        const index = emptyDownloadIndex()
        updateDownloadIndex(
            index,
            {id: "pkg", title: "none", map: {}, bytes: 0, version: "0.1.0", previousVersion: "none", resolvedUrl: ""}
        )
        expect(index.downloads.length).toBe(1)
        const res = updateDownloadIndex(
            index,
            {id: "pkg", title: "none", map: {}, bytes: 1, version: "0.2.0", previousVersion: "0.1.0", resolvedUrl: ""}
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
            {id: "pkg", title: "none", map: {}, bytes: 20, version: "0.1.0", previousVersion: "none", resolvedUrl: ""}
        )
        updateDownloadIndex(
            index,
            {id: "pkg-2", title: "none", map: {}, bytes: 50, version: "0.1.0", previousVersion: "none", resolvedUrl: ""}
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
            {id: "pkg", title: "none", map: {}, bytes: 20, version: "0.1.0", previousVersion: "none", resolvedUrl: ""}
        )
        updateDownloadIndex(
            index,
            {id: "pkg-2", title: "none", map: {}, bytes: 50, version: "0.1.0", previousVersion: "none", resolvedUrl: ""}
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
            {id: "pkg", title: "none", map: {}, bytes: 20, version: "0.1.0", previousVersion: "none", resolvedUrl: ""}
        )
        updateDownloadIndex(
            index,
            {id: "pkg-2", title: "none", map: {}, bytes: 50, version: "0.1.0", previousVersion: "none", resolvedUrl: ""}
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
            {id: "pkg", title: "none", map: {}, bytes: 20, version: "0.1.0", previousVersion: "none", resolvedUrl: ""}
        )
        updateDownloadIndex(
            index,
            {id: "pkg-2", title: "none", map: {}, bytes: 50, version: "0.1.0", previousVersion: "none", resolvedUrl: ""}
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
            {id: "pkg", title: "none", map: {}, bytes: 20, version: "0.1.0", previousVersion: "none", resolvedUrl: ""}
        )
        updateDownloadIndex(
            index,
            {id: "pkg-2", title: "none", map: {}, bytes: 50, version: "0.1.0", previousVersion: "none", resolvedUrl: ""}
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
} from "./backend"

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
                logoUrl: "",
                permissions: [] as Permissions,
                name: "pkg",
                state: "updating",
                version: "0.1.0",
                bytes: 0,
                entry: "store/index.js",
                resolvedUrl: "store/",
                canonicalUrl: "store/",
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
            logoUrl: "",
            permissions: [] as Permissions,
            state: "updating",
            version: "0.1.0",
            bytes: 0,
            entry: "store/index.js",
            resolvedUrl: "store/",
            canonicalUrl: "store/",
        } as const
        updateCargoIndex(index, first)
        expect(index.cargos.length).toBe(1)
        const second = {
            id: "pkg",
            name: "pkg",
            logoUrl: "",
            permissions: [] as Permissions,
            state: "cached",
            version: "0.2.0",
            bytes: 0,
            entry: "store/index.js",
            resolvedUrl: "store/",
            canonicalUrl: "store/",
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
            logoUrl: "",
            permissions: [] as Permissions,
            state: "updating",
            version: "0.1.0",
            bytes: 0,
            entry: "store/index.js",
            resolvedUrl: "store/",
            canonicalUrl: "store/",
        } as const
        updateCargoIndex(index, first)
        const second = {
            id: "pkg-2",
            name: "pkg",
            state: "cached",
            logoUrl: "",
            permissions: [] as Permissions,
            version: "0.2.0",
            bytes: 0,
            entry: "store/index.js",
            resolvedUrl: "store/",
            canonicalUrl: "store/",
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
            logoUrl: "",
            permissions: [] as Permissions,
            version: "0.1.0",
            bytes: 0,
            entry: "store/index.js",
            resolvedUrl: "store/",
            canonicalUrl: "store/",
        } as const
        updateCargoIndex(index, first)
        const second = {
            id: "pkg-2",
            name: "pkg",
            state: "cached",
            permissions: [] as Permissions,
            version: "0.2.0",
            logoUrl: "",
            bytes: 0,
            entry: "store/index.js",
            resolvedUrl: "store/",
            canonicalUrl: "store/",
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

import {
    getErrorDownloadIndex, 
    saveErrorDownloadIndex
} from "./backend"

describe("reading and writing error download indices", () => {
    it("if error index doesn't exist return null", async () => {
        const fileFetcher = createFileCache({})
        const origin = "https://potato-house.com"
        const resolvedUrl = `${origin}/potato/`
        const res = await getErrorDownloadIndex(
            resolvedUrl, fileFetcher
        )
        expect(res).toBe(null)
    })

    it("if error index exists, getting index should return a valid index", async () => {
        const fileFetcher = createFileCache({})
        const origin = "https://potato-house.com"
        const resolvedUrl = `${origin}/potato/`
        const index = {
            id: "tmp",
            map: {},
            title: "none",
            startedAt: Date.now(),
            bytes: 0,
            version: "0.1.0",
            previousVersion: "0.1.0-beta",
            resolvedUrl: "",
        } as const
        await saveErrorDownloadIndex(
            resolvedUrl, index, fileFetcher
        )
        const res = await getErrorDownloadIndex(
            resolvedUrl, fileFetcher
        )
        expect(res).not.toBe(null)
    })

    it("attempting to save an error download index with a relative url should throw an error", async () => {
        const fileFetcher = createFileCache({})
        const resolvedUrl = `/potato/`
        const index = {
            id: "tmp",
            map: {},
            title: "none",
            startedAt: Date.now(),
            bytes: 0,
            version: "0.1.0",
            previousVersion: "0.1.0-beta",
            resolvedUrl: "",
        } as const
        
        expect(async () => await saveErrorDownloadIndex(
            resolvedUrl, index, fileFetcher
        )).rejects.toThrow()
    })
})