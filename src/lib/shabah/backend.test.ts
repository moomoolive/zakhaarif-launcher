import {expect, describe, it} from "vitest"
import {
    operationCodes,
    getErrorDownloadIndex, saveErrorDownloadIndex
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
            previousId: "",
            title: "none",
            startedAt: Date.now(),
            bytes: 0,
            segments: [
                {
                    version: "0.1.0",
                    name: "",
                    previousVersion: "0.1.0-beta",
                    resolvedUrl: "",
                    canonicalUrl: "",
                    bytes: 0,
                    map: {},
                    resourcesToDelete: [],
                    downloadedResources: [],
                    canRevertToPreviousVersion: false
                }
            ]
        }
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
            previousId: "",
            title: "none",
            startedAt: Date.now(),
            bytes: 0,
            segments: [
                {
                    version: "0.1.0",
                    previousVersion: "0.1.0-beta",
                    resolvedUrl: "",
                    name: "",
                    canonicalUrl: "",
                    map: {},
                    bytes: 0,
                    resourcesToDelete: [],
                    downloadedResources: [],
                    canRevertToPreviousVersion: false
                }
            ]
        }
        expect(async () => await saveErrorDownloadIndex(
            resolvedUrl, index, fileFetcher
        )).rejects.toThrow()
    })

    it("if error index has more than more segment, error index should not be saved, and error code should be returned", async () => {
        const fileFetcher = createFileCache({})
        const origin = "https://potato-house.com"
        const resolvedUrl = `${origin}/potato/`
        const index = {
            id: "tmp",
            previousId: "",
            title: "none",
            startedAt: Date.now(),
            bytes: 0,
            segments: [
                {
                    version: "0.1.0",
                    previousVersion: "0.1.0-beta",
                    resolvedUrl: "",
                    name: "",
                    canonicalUrl: "",
                    bytes: 0,
                    map: {},
                    resourcesToDelete: [],
                    downloadedResources: [],
                    canRevertToPreviousVersion: false
                },
                {
                    version: "0.1.0",
                    previousVersion: "0.1.0-beta",
                    resolvedUrl: "",
                    canonicalUrl: "",
                    name: "",
                    bytes: 0,
                    map: {},
                    resourcesToDelete: [],
                    downloadedResources: [],
                    canRevertToPreviousVersion: false
                }
            ]
        }
        const status = await saveErrorDownloadIndex(
            resolvedUrl, index, fileFetcher
        )
        expect(status).toBe(operationCodes.tooManySegments)
        const res = await getErrorDownloadIndex(
            resolvedUrl, fileFetcher
        )
        expect(res).toBe(null)
    })

    it("if error index has no segments, error index should not be saved, and error code should be returned", async () => {
        const fileFetcher = createFileCache({})
        const origin = "https://potato-house.com"
        const resolvedUrl = `${origin}/potato/`
        const index = {
            id: "tmp",
            previousId: "",
            title: "none",
            startedAt: Date.now(),
            bytes: 0,
            segments: []
        }
        const status = await saveErrorDownloadIndex(
            resolvedUrl, index, fileFetcher
        )
        expect(status).toBe(operationCodes.noSegmentsFound)
        const res = await getErrorDownloadIndex(
            resolvedUrl, fileFetcher
        )
        expect(res).toBe(null)
    })
})