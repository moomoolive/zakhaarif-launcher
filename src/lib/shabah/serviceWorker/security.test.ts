import {describe, it, expect, vi} from "vitest"
import {
    makeBackgroundFetchHandler, ProgressUpdateRecord
} from "./backgroundFetchHandler"
import {
    ResourceMap,
} from "../backend"
import {urlToMime} from "../../miniMime/index"
import {getErrorDownloadIndex} from "../backend"
import { nanoid } from "nanoid"
import {createBgFetchArgs, createBgFetchEvent, createDownloadIndex} from "./testLib"

describe("virtual file system", () => {
    it("error indexes should be written to virtual file cache if specified", async () => {
        const origin = "https://cool-potatos.com"
        const remoteOrigin = "https://remote-origin.site"
        const resolvedUrl = origin + "/pkg-store/"
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
            virtualFileCache,
            messageConsumer
        } = createBgFetchArgs({})
        const canonicalUrl = remoteOrigin
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

        const messageAfterCommit = await messageConsumer.getMessage(downloadId)
        expect(messageAfterCommit).not.toBe(null)
        expect(messageAfterCommit).toStrictEqual(message)

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
            virtualFileCache,
            backendMessageChannel: messageConsumer
        })

        await handler(event)       
        const errorIndex = await getErrorDownloadIndex(
            resolvedUrl,
            virtualFileCache
        )
        expect(errorIndex).not.toBe(null)
        const normalFileErrorIndex = await getErrorDownloadIndex(
            resolvedUrl,
            fileCache
        )
        expect(normalFileErrorIndex).toBe(null)
    })
})