import { describe, it, expect } from "vitest"
import {Shabah} from "../downloadClient"
import {CACHED, NO_UPDATE_QUEUED, UPDATING} from "../backend"
import { 
    HuzmaManifest, 
    MANIFEST_FILE_SUFFIX, 
    NULL_FIELD 
} from "huzma"
import {createClient, createUpdateCheck, FileHandlers} from "./testLib"

describe("executing live updates", () => {
    it("attempting to queue a download with an empty array does not queue a download", async () => {
        const mainOrigin = "https://yo-mama.com"
        const {client, downloadState} = createClient(mainOrigin, {
            cacheFiles: {},
            networkFiles: {},
        })
        expect(downloadState.queuedDownloads.length).toBe(0)
        const response = await client.executeUpdates([], "none", {
            backgroundDownload: false
        })
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
            Shabah.STATUS.invalidManifestEncoding,
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
                "my update",
                {backgroundDownload: false}
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
                "my update",
                {backgroundDownload: false}
            )
            expect(queueResponse.ok).toBe(true)
            expect(queueResponse.data).toBe(Shabah.STATUS.updateImpossible)
            expect(downloadState.queuedDownloads.length).toBe(0)
        }
    })
})

describe("dealing with valid updates", () => {
    const origin = "https://my-mamas-house.com"
    const cases = [
        {
            storage: {used: 100, total: 20_000, left: 100},
            downloadableResources: [
                {code: 200, requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 500},
                {code: 422, requestUrl: `${origin}/cool.png`, storageUrl: `${origin}/cool.png`, bytes: 500},
            ]
        },
        {
            storage: {used: 100, total: 20_000, left: 1_900},
            downloadableResources: [
                {code: 200, requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 500},
                {code: 500, requestUrl: `${origin}/style.css`, storageUrl: `${origin}/style.css`, bytes: 2_300},
            ]
        },
        {
            storage: {used: 0, total: 20_000, left: 10},
            downloadableResources: [
                {code: 200, requestUrl: `${origin}/index.js`, storageUrl: `${origin}/index.js`, bytes: 2},
                {code: 404, requestUrl: `${origin}/style.css`, storageUrl: `${origin}/style.css`, bytes: 1},
                {code: 200, requestUrl: `${origin}/pic.png`, storageUrl: `${origin}/pic.png`, bytes: 8},
            ]
        },
    ]

    it("if update is valid, live update should fetch resource directly and insert them in cache", async () => {
        for (const {storage, downloadableResources} of cases) {
            const canonicalUrl = origin + "/"
            const networkFilesInit: FileHandlers = {}
            const networkFiles = downloadableResources.reduce(
                (total, next) => {
                    total[next.requestUrl] = () => new Response("", {status: 200})
                    return total
                },
                networkFilesInit
            )
            const {client, downloadState, caches} = createClient(origin, {
                cacheFiles: {},
                networkFiles,
            })
            
            const updateResponse = createUpdateCheck({
                status: Shabah.STATUS.ok,
                tag: 0,
                originalResolvedUrl: canonicalUrl,
                resolvedUrl: canonicalUrl,
                canonicalUrl,
                
                diskInfo: storage,
                newCargo: new HuzmaManifest(),
                originalNewCargoResponse: new Response(),
                
                    downloadableResources,
                    resourcesToDelete: []
                
            })

            expect(caches.innerFileCache.list()).length(0)
            expect(downloadState.queuedDownloads.length).toBe(0)
            const queueResponse = await client.executeUpdates(
                [updateResponse],
                "my update",
                {backgroundDownload: false}
            )
            expect(queueResponse.ok).toBe(true)
            expect(queueResponse.data).toBe(Shabah.STATUS.ok)
            expect(downloadState.queuedDownloads.length).toBe(0)
            expect(caches.innerFileCache.list().length).toBeGreaterThan(0)
            for (const {requestUrl} of downloadableResources) {
                const file = await client.getCachedFile(requestUrl)
                expect(file).not.toBe(null)
                expect(file).toBeInstanceOf(Response)
            }
        }
    })

    it("if update is valid and some of downloadable resources failed to be fetched, an error code should be returned", async () => {
        for (const {storage, downloadableResources} of cases) {
            const canonicalUrl = origin + "/"
            const networkFilesInit: FileHandlers = {}
            const networkFiles = downloadableResources.reduce(
                (total, next) => {
                    total[next.requestUrl] = () => new Response("", {status: next.code})
                    return total
                },
                networkFilesInit
            )
            const {client, downloadState, caches} = createClient(origin, {
                cacheFiles: {},
                networkFiles,
            })
            
            const updateResponse = createUpdateCheck({
                status: Shabah.STATUS.ok,
                tag: 0,
                originalResolvedUrl: canonicalUrl,
                resolvedUrl: canonicalUrl,
                canonicalUrl,
                
                diskInfo: storage,
                newCargo: new HuzmaManifest(),
                originalNewCargoResponse: new Response(),
                
                    downloadableResources,
                    resourcesToDelete: []
                
            })

            expect(caches.innerFileCache.list()).length(0)
            expect(downloadState.queuedDownloads.length).toBe(0)
            const queueResponse = await client.executeUpdates(
                [updateResponse],
                "my update",
                {backgroundDownload: false}
            )
            expect(queueResponse.ok).toBe(true)
            expect(queueResponse.data).toBe(Shabah.STATUS.liveFetchFailed)
            expect(downloadState.queuedDownloads.length).toBe(0)

            for (const {requestUrl, code} of downloadableResources) {
                const file = await client.getCachedFile(requestUrl)
                if (code !== 200) {
                    expect(file).toBe(null)
                } else {
                    expect(file).not.toBe(null)
                    expect(file).toBeInstanceOf(Response)
                }
            }
        }
    })

    it("if update is valid and some of downloadable resources failed to be fetched, files that were fetched should be cached correctly", async () => {
        for (const {storage, downloadableResources} of cases) {
            const canonicalUrl = origin + "/"
            const networkFilesInit: FileHandlers = {}
            const networkFiles = downloadableResources.reduce(
                (total, next) => {
                    total[next.requestUrl] = () => new Response("", {status: next.code})
                    return total
                },
                networkFilesInit
            )
            const {client, downloadState, caches} = createClient(origin, {
                cacheFiles: {},
                networkFiles,
            })
            
            const updateResponse = createUpdateCheck({
                status: Shabah.STATUS.ok,
                tag: 0,
                originalResolvedUrl: canonicalUrl,
                resolvedUrl: canonicalUrl,
                canonicalUrl,
                
                diskInfo: storage,
                newCargo: new HuzmaManifest(),
                originalNewCargoResponse: new Response(),
                
                    downloadableResources,
                    resourcesToDelete: []
                
            })

            expect(caches.innerFileCache.list()).length(0)
            expect(downloadState.queuedDownloads.length).toBe(0)
            const queueResponse = await client.executeUpdates(
                [updateResponse],
                "my update",
                {backgroundDownload: false}
            )

            expect(queueResponse.ok).toBe(true)
            expect(downloadState.queuedDownloads.length).toBe(0)

            for (const {requestUrl, code} of downloadableResources) {
                const file = await client.getCachedFile(requestUrl)
                if (code !== 200) {
                    expect(file).toBe(null)
                } else {
                    expect(file).not.toBe(null)
                    expect(file).toBeInstanceOf(Response)
                }
            }
        }
    })
})