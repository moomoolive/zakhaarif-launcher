import {describe, it, expect} from "vitest"
import {
    makeBackgroundFetchHandler, ProgressUpdateRecord
} from "./backgroundFetchHandler"
import {
    ResourceMap,
    NO_UPDATE_QUEUED,
    DownloadSegment,
    CACHED,
    UPDATING,
    ABORTED,
    FAILED,
    DownloadIndex
} from "../backend"
import {urlToMime} from "../../miniMime/index"
import {getErrorDownloadIndex} from "../backend"
import { nanoid } from "nanoid"
import {
    createBgFetchArgs, 
    createDownloadIndex,
    createBgFetchEvent
} from "./testLib"

describe("background fetch fail handler (abort/fail)", () => {
    it("failed handler should save successfully fetches to cache, and create a record of failed fetches", async () => {
        const origin = "https://cool-potatos.com"
        const remoteOrigin = "https://remote-origin.site"
        const resolvedUrl = origin + "/pkg-store/"
        const remoteRootUrl = remoteOrigin + "/pkg/"
        const cacheFiles = [
            {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
            {name: "index.js", status: 200, statusText: "OK", bytes: 0},
            {name: "perf.wasm", status: 403, statusText: "FORBIDDEN", bytes: 0},
            {name: "icon.png", status: 404, statusText: "NOT FOUND", bytes: 0},
        ]
        const cacheFileMeta = cacheFiles.map(({name, status, statusText}) => ({
            storageUrl: resolvedUrl + name,
            bytes: 0,
            requestUrl: remoteRootUrl + name,
            mime: urlToMime(name) || "text/plain",
            status,
            statusText
        }) as const)
        const {
            fileCache, 
            internalRecord, 
            clientMessageChannel,
            messageConsumer,
            virtualFileCache
        } = createBgFetchArgs({})
        const canonicalUrl = remoteOrigin
        const downloadId = nanoid(21)
        const backendMessage = createDownloadIndex({
            id: downloadId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            resolvedUrl,
            canonicalUrl,
            map: cacheFileMeta.reduce((total, item) => {
                const {requestUrl} = item
                total[requestUrl] = item
                return total
            }, {} as ResourceMap),
            bytes: 0,
        })
        await messageConsumer.createMessage(backendMessage)
        const prevFilecount = Object.keys(internalRecord).length
        const {event} = createBgFetchEvent({
            id: downloadId, 
            recordsAvailable: true,
            result: "failure",
            fetchResult: cacheFileMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response(
                    "", 
                    {status: item.status}
                )
                return total
            }, {} as Record<string, Response>)
        })
        const handler = makeBackgroundFetchHandler({
            origin, 
            fileCache, 
            clientMessageChannel,
            log: () => {},
            type: "fail",
            backendMessageChannel: messageConsumer,
            virtualFileCache
        })
        await handler(event)
        const finishedRequests = cacheFiles.filter((file) => file.status === 200)
        expect(Object.keys(internalRecord).length).toBe(prevFilecount + finishedRequests.length)
        const errorIndex = await getErrorDownloadIndex(resolvedUrl, virtualFileCache)
        const clientMessages = await clientMessageChannel.getAllMessages()
        expect(clientMessages).length(1)
        expect(clientMessages[0].downloadId).toBe(downloadId)
        expect(clientMessages[0].stateUpdates).length(1)
        expect(clientMessages[0].stateUpdates[0]).toStrictEqual({
            canonicalUrl,
            state: FAILED
        })
        expect(errorIndex).not.toBe(null)
        const failedRequests = cacheFiles.filter((f) => f.status !== 200)
        expect(Object.keys(errorIndex?.index.segments[0].map || {}).length).toBe(
            failedRequests.length
        )
    })

    it("failed handler should call update ui function", async () => {
        const origin = "https://cool-potatos.com"
        const remoteOrigin = "https://remote-origin.site"
        const resolvedUrl = origin + "/pkg-store/"
        const remoteRootUrl = remoteOrigin + "/pkg/"
        const cacheFiles = [
            {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
            {name: "index.js", status: 200, statusText: "OK", bytes: 0},
            {name: "perf.wasm", status: 403, statusText: "FORBIDDEN", bytes: 0},
            {name: "icon.png", status: 404, statusText: "NOT FOUND", bytes: 0},
        ]
        const cacheFileMeta = cacheFiles.map(({name, status, statusText}) => ({
            storageUrl: resolvedUrl + name,
            bytes: 0,
            requestUrl: remoteRootUrl + name,
            mime: urlToMime(name) || "text/plain",
            status,
            statusText
        }) as const)
        const canonicalUrl = remoteOrigin
        const {
            fileCache, internalRecord, clientMessageChannel,
            messageConsumer,
            virtualFileCache
        } = createBgFetchArgs({})
        const downloadId = nanoid(21)
        const message = createDownloadIndex({
            id: downloadId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            resolvedUrl,
            canonicalUrl,
            map: cacheFileMeta.reduce((total, item) => {
                const {requestUrl} = item
                total[requestUrl] = item
                return total
            }, {} as ResourceMap),
            bytes: 0
        })
        await messageConsumer.createMessage(message)
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: downloadId, 
            recordsAvailable: true,
            result: "failure",
            fetchResult: cacheFileMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response(
                    "", 
                    {status: item.status}
                )
                return total
            }, {} as Record<string, Response>)
        })
        const handler = makeBackgroundFetchHandler({
            origin, 
            fileCache, 
            clientMessageChannel,
            log: () => {},
            type: "fail",
            virtualFileCache,
            backendMessageChannel: messageConsumer
        })
        await handler(event)
        expect(output.ui.updateCalled).toBe(true)
        expect(!!output.ui.state).toBe(true)
        const clientMessages = await clientMessageChannel.getAllMessages()
        expect(clientMessages).length(1)
        expect(clientMessages[0].downloadId).toBe(downloadId)
        expect(clientMessages[0].stateUpdates).length(1)
        expect(clientMessages[0].stateUpdates[0]).toStrictEqual({
            canonicalUrl,
            state: FAILED
        })
        const finishedRequests = cacheFiles.filter((f) => f.status === 200)
        expect(Object.keys(internalRecord).length).toBe(prevFilecount + finishedRequests.length)
        const errorIndex = await getErrorDownloadIndex(
            resolvedUrl,
            virtualFileCache
        )
        expect(errorIndex).not.toBe(null)
        const failedRequests = cacheFiles.filter((f) => f.status !== 200)
        expect(Object.keys(errorIndex?.index.segments[0].map || {}).length).toBe(
            failedRequests.length
        )
    })

    it(`failed handler should set cargo indexes download id to "${NO_UPDATE_QUEUED}" (no update queued)`, async () => {
        const origin = "https://cool-potatos.com"
        const remoteOrigin = "https://remote-origin.site"
        const resolvedUrl = origin + "/pkg-store/"
        const remoteRootUrl = remoteOrigin + "/pkg/"
        const cacheFiles = [
            {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
            {name: "index.js", status: 200, statusText: "OK", bytes: 0},
            {name: "perf.wasm", status: 403, statusText: "FORBIDDEN", bytes: 0},
            {name: "icon.png", status: 404, statusText: "NOT FOUND", bytes: 0},
        ]
        const cacheFileMeta = cacheFiles.map(({name, status, statusText}) => ({
            storageUrl: resolvedUrl + name,
            bytes: 0,
            requestUrl: remoteRootUrl + name,
            mime: urlToMime(name) || "text/plain",
            status,
            statusText
        }) as const)
        const canonicalUrl = remoteOrigin
        const {
            fileCache, internalRecord, clientMessageChannel,
            messageConsumer,
            virtualFileCache
        } = createBgFetchArgs({})
        const downloadId = nanoid(21)
        const message = createDownloadIndex({
            id: downloadId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            resolvedUrl,
            canonicalUrl,
            map: cacheFileMeta.reduce((total, item) => {
                const {requestUrl} = item
                total[requestUrl] = item
                return total
            }, {} as ResourceMap),
            bytes: 0
        })
        await messageConsumer.createMessage(message)
        const prevFilecount = Object.keys(internalRecord).length
        const {event, output} = createBgFetchEvent({
            id: downloadId, 
            recordsAvailable: true,
            result: "failure",
            fetchResult: cacheFileMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response(
                    "", 
                    {status: item.status}
                )
                return total
            }, {} as Record<string, Response>)
        })
        const handler = makeBackgroundFetchHandler({
            origin, 
            fileCache,
            clientMessageChannel, 
            log: () => {},
            type: "fail",
            backendMessageChannel: messageConsumer,
            virtualFileCache
        })
        await handler(event)
        expect(output.ui.updateCalled).toBe(true)
        expect(!!output.ui.state).toBe(true)
        const clientMessages = await clientMessageChannel.getAllMessages()
        expect(clientMessages).length(1)
        expect(clientMessages[0].downloadId).toBe(downloadId)
        expect(clientMessages[0].stateUpdates).length(1)
        const expectedMessage = {canonicalUrl, state: FAILED}
        expect(clientMessages[0].stateUpdates[0]).toStrictEqual(expectedMessage)

        const finishedRequests = cacheFiles.filter((f) => f.status === 200)
        expect(await fileCache.listFiles()).length(prevFilecount + finishedRequests.length)
        const errorIndex = await getErrorDownloadIndex(resolvedUrl, virtualFileCache)
        expect(errorIndex).not.toBe(null)
        const failedRequests = cacheFiles.filter((file) => file.status !== 200)
        expect(Object.keys(errorIndex?.index.segments[0].map || {}).length).toBe(failedRequests.length)
    })

    it(`if multiple segments are being downloaded together and operation fails, error logs should be only be created for segments that failed`, async () => {
        const mainOrigin = "https://green-corn.com"
        const testCases = [
            [
                {
                    origin: "https://cool-potatos.com",
                    files : [
                        {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
                        {name: "index.js", status: 200, statusText: "OK", bytes: 0},
                        {name: "perf.wasm", status: 403, statusText: "FORBIDDEN", bytes: 0},
                        {name: "icon.png", status: 404, statusText: "NOT FOUND", bytes: 0},
                    ],
                },
                {
                    origin: "https://veggies.com",
                    files : [
                        {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
                        {name: "entry.js", status: 200, statusText: "OK", bytes: 0},
                    ],
                },
                {
                    origin: "https://corn-on-the-cob.com",
                    files : [
                        {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
                        {name: "pixie.png", status: 200, statusText: "OK", bytes: 0},
                        {name: "texture.png", status: 200, statusText: "OK", bytes: 0},
                    ],
                },
            ],
            [
                {
                    origin: "https://purple-radish.com",
                    files : [
                        {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
                        {name: "index.js", status: 200, statusText: "OK", bytes: 0},
                        {name: "perf.wasm", status: 200, statusText: "FORBIDDEN", bytes: 0},
                        {name: "icon.png", status: 200, statusText: "NOT FOUND", bytes: 0},
                    ],
                },
                {
                    origin: "https://cool-veggies.com",
                    files : [
                        {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
                        {name: "entry.js", status: 200, statusText: "OK", bytes: 0},
                        {name: "dynamic-link.js", status: 500, statusText: "OK", bytes: 0},
                    ],
                },
                {
                    origin: "https://hey.com",
                    files : [
                        {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
                        {name: "no.png", status: 200, statusText: "OK", bytes: 0},
                        {name: "texture.png", status: 403, statusText: "OK", bytes: 0},
                    ],
                },
            ]
        ]
        for (const testCase of testCases) {
            const {
                fileCache, internalRecord, 
                clientMessageChannel,
                messageConsumer,
                virtualFileCache
            } = createBgFetchArgs({})
            const downloadId = nanoid(21)
            const queuedDownload: DownloadIndex = {
                id: downloadId, 
                previousId: "",
                title: "random-update" + Math.random(), 
                bytes: 0,
                segments: [] as DownloadSegment[],
                startedAt: Date.now()
            }
            const allFileCacheMeta = []
            for (const {origin, files} of testCase) {
                const canonicalUrl = origin + "/"
                const resolvedUrl = canonicalUrl
                const cacheFiles = files
                const cacheFileMeta = cacheFiles.map(({name, status, statusText}) => ({
                    storageUrl: resolvedUrl + name,
                    bytes: 0,
                    requestUrl: resolvedUrl + name,
                    mime: urlToMime(name) || "text/plain",
                    status,
                    statusText
                }) as const)
                allFileCacheMeta.push(...cacheFileMeta)
                const resourceMap = cacheFileMeta.reduce((total, item) => {
                    const {requestUrl} = item
                    total[requestUrl] = item
                    return total
                }, {} as ResourceMap)
                queuedDownload.segments.push({
                    name: "",
                    version: "0.1.0",
                    previousVersion: "none",
                    resolvedUrl,
                    canonicalUrl,
                    map: resourceMap,
                    bytes: 0,
                    resourcesToDelete: [],
                    downloadedResources: [],
                    canRevertToPreviousVersion: false
                })
            }
            await messageConsumer.createMessage(queuedDownload)
            const prevFilecount = Object.keys(internalRecord).length
            const fetchResult = allFileCacheMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response(
                    "", 
                    {status: item.status}
                )
                return total
            }, {} as Record<string, Response>)
            const {event, output} = createBgFetchEvent({
                id: downloadId, 
                recordsAvailable: true,
                result: "failure",
                fetchResult
            })
            const handler = makeBackgroundFetchHandler({
                origin: mainOrigin, 
                fileCache,
                clientMessageChannel,
                log: () => {},
                type: "fail",
                backendMessageChannel: messageConsumer,
                virtualFileCache
            })
            await handler(event)
            expect(output.ui.updateCalled).toBe(true)
            expect(!!output.ui.state).toBe(true)
            const clientMessages = await clientMessageChannel.getAllMessages()
            expect(clientMessages).length(1)

            const finishedRequests = allFileCacheMeta.filter((file) => file.status === 200)
            
            expect(Object.keys(internalRecord).length).toBe(prevFilecount + finishedRequests.length) 
            
            for (const [index, {origin, files}] of testCase.entries()) {
                const shouldBeOk = files.every((file) => file.status === 200)
                const resolvedUrl = origin + "/"
                const canonicalUrl = resolvedUrl
                
                const errorIndex = await getErrorDownloadIndex(resolvedUrl, virtualFileCache)
                expect(clientMessages[0].downloadId).toBe(downloadId)
                expect(clientMessages[0].stateUpdates).length(testCase.length)
                
                if (shouldBeOk) {
                    expect(errorIndex).toBe(null)
                    expect(clientMessages[0].stateUpdates[index]).toStrictEqual({
                        canonicalUrl,
                        state: CACHED
                    })
                    continue
                }
                expect(clientMessages[0].stateUpdates[index]).toStrictEqual({
                    canonicalUrl,
                    state: FAILED
                })
                expect(errorIndex).not.toBe(null)
                // should only have one segment
                expect(errorIndex?.index.segments.length).toBe(1)
                expect(errorIndex?.index.previousId).toBe(downloadId)
                const failedRequests = files
                    .filter((file) => file.status !== 200)
                    .map((file) => resolvedUrl + file.name)
                for (const url of failedRequests) {
                    const found = errorIndex?.index.segments[0].map[url]
                    expect(!!found).toBe(true)
                }
            }
        }
    })

    it("if download index storage root url is a relative url during fail handle, handler should add correct it to be a full url", async () => {
        const origin = "https://cool-potatos.com"
        const remoteOrigin = "https://remote-origin.site"
        const storageExtension = "/pkg-store/"
        const resolvedUrl = origin + storageExtension
        const remoteRootUrl = remoteOrigin + "/pkg/"
        const cacheFiles = [
            {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
            {name: "index.js", status: 200, statusText: "OK", bytes: 0},
            {name: "perf.wasm", status: 403, statusText: "FORBIDDEN", bytes: 0},
            {name: "icon.png", status: 404, statusText: "NOT FOUND", bytes: 0},
        ]
        const cacheFileMeta = cacheFiles.map(({name, status, statusText}) => ({
            storageUrl: resolvedUrl + name,
            bytes: 0,
            requestUrl: remoteRootUrl + name,
            mime: urlToMime(name) || "text/plain",
            status,
            statusText
        }) as const)
        const canonicalUrl = remoteOrigin
        const {
            fileCache, internalRecord, 
            clientMessageChannel,
            messageConsumer,
            virtualFileCache
        } = createBgFetchArgs({})
        const downloadId = nanoid(21)
        await messageConsumer.createMessage(createDownloadIndex({
            id: downloadId,
            title: "unknown",
            version: "0.1.0",
            previousVersion: "none",
            resolvedUrl: storageExtension,
            canonicalUrl,
            map: cacheFileMeta.reduce((total, item) => {
                const {requestUrl} = item
                total[requestUrl] = item
                return total
            }, {} as ResourceMap),
            bytes: 0
        }))
        const prevFilecount = Object.keys(internalRecord).length
        const {event} = createBgFetchEvent({
            id: downloadId, 
            recordsAvailable: true,
            result: "failure",
            fetchResult: cacheFileMeta.reduce((total, item) => {
                total[item.requestUrl] = new Response(
                    "", 
                    {status: item.status}
                )
                return total
            }, {} as Record<string, Response>)
        })
        const handler = makeBackgroundFetchHandler({
            origin, 
            fileCache,
            clientMessageChannel,
            log: () => {},
            type: "abort",
            backendMessageChannel: messageConsumer,
            virtualFileCache
        })
        await handler(event)

        const finishedRequests = cacheFiles.filter((f) => f.status === 200)
        expect(await fileCache.listFiles()).length(
            prevFilecount + finishedRequests.length
        )
        const clientMessages = await clientMessageChannel.getAllMessages()
        expect(clientMessages).length(1)
        expect(clientMessages[0].downloadId).toBe(downloadId)
        expect(clientMessages[0].stateUpdates).length(1)
        expect(clientMessages[0].stateUpdates[0]).toStrictEqual({
            canonicalUrl,
            state: ABORTED
        })

        const errorIndex = await getErrorDownloadIndex(
            resolvedUrl,
            virtualFileCache
        )
        expect(errorIndex).not.toBe(null)
        const failedRequests = cacheFiles.filter((f) => f.status !== 200)
        expect(Object.keys(errorIndex?.index.segments[0].map || {}).length).toBe(
            failedRequests.length
        )
    })

    it(`abort & fail handlers should fire on progress callback once`, async () => {
        const tests = [
            {eventName: "abort", origin: "https://cool-potatos.com"},
            {eventName: "fail", origin: "https://cool-tomates.com"},
        ] as const

        for (const {origin, eventName} of tests) {
            const canonicalUrl = origin + "/"
            const resolvedUrl = canonicalUrl
            const cacheFiles = [
                {name: "cargo.json", status: 200, statusText: "OK", bytes: 0},
                {name: "index.js", status: 200, statusText: "OK", bytes: 0},
                {name: "perf.wasm", status: 403, statusText: "FORBIDDEN", bytes: 0},
                {name: "icon.png", status: 404, statusText: "NOT FOUND", bytes: 0},
            ]
            const cacheFileMeta = cacheFiles.map(({name, status, statusText}) => ({
                storageUrl: resolvedUrl + name,
                bytes: 0,
                requestUrl: resolvedUrl + name,
                mime: urlToMime(name) || "text/plain",
                status,
                statusText
            }) as const)
            const {
                fileCache, 
                clientMessageChannel,
                messageConsumer,
                virtualFileCache
            } = createBgFetchArgs({})
            const downloadId = nanoid(21)
            
            await messageConsumer.createMessage(createDownloadIndex({
                id: downloadId,
                title: "unknown",
                version: "0.1.0",
                previousVersion: "none",
                resolvedUrl,
                canonicalUrl,
                map: cacheFileMeta.reduce((total, item) => {
                    const {requestUrl} = item
                    total[requestUrl] = item
                    return total
                }, {} as ResourceMap),
                bytes: 0
            }))

            const {event, output} = createBgFetchEvent({
                id: downloadId, 
                recordsAvailable: true,
                result: "failure",
                fetchResult: cacheFileMeta.reduce((total, item) => {
                    total[item.requestUrl] = new Response(
                        "", 
                        {status: item.status}
                    )
                    return total
                }, {} as Record<string, Response>)
            })
            const progressEvents: ProgressUpdateRecord[] = []
            
            const handler = makeBackgroundFetchHandler({
                origin, 
                fileCache, 
                clientMessageChannel,
                virtualFileCache,
                log: () => {},
                type: eventName,
                onProgress: (progress) => progressEvents.push(progress),
                backendMessageChannel: messageConsumer
            })

            await handler(event)
            if (eventName === "abort") {
                expect(output.ui.updateCalled).toBe(false)
                expect(!!output.ui.state).toBe(false)
            } else {
                expect(output.ui.updateCalled).toBe(true)
                expect(!!output.ui.state).toBe(true)
            }
            expect(progressEvents.length).toBe(1)
            expect(progressEvents[0].type).toBe(eventName)
            expect(progressEvents[0].downloadId).toBe(downloadId)
            expect(progressEvents[0].canonicalUrls).toStrictEqual([canonicalUrl])
        }
    })
})