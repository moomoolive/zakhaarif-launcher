import {describe, it, expect} from "vitest"
import {createClient} from "./testLib"
import {DownloadIndexCollection, downloadIndicesUrl} from "../backend"

describe("virtual files should not be accessible from normal file system", () => {
    it("virtual files should return undefined if attempted to be accessed", async () => {
        const mainOrigin = "https://hey.com"
        const tests = [
            {
                id: "1",
                previousId: "",
                title: "rand",
                segments: [],
                bytes: 0
            },
            {
                id: "2",
                previousId: "",
                title: "rand-2",
                segments: [],
                bytes: 0
            },
            {
                id: "4",
                previousId: "",
                title: "rand-4",
                segments: [],
                bytes: 0
            }
        ]
        for (const test of tests) {
            const {client, caches} = createClient(mainOrigin, {createVirtualCache: true})
            await client.putDownloadIndex(test)
            const downloadIndexesVirtualAddress = downloadIndicesUrl(mainOrigin)
            const file = caches.innerVirtualCache.getFile(downloadIndexesVirtualAddress)
            expect(file).not.toBe(null)
            const parsed = await file?.clone().json() as DownloadIndexCollection
            const target = parsed.downloads.findIndex(
                (download) => download.id === test.id
            )
            expect(parsed.downloads[target]).toEqual(expect.objectContaining(test))
            const storageSystemFileAccess = await client.getCachedFile(downloadIndexesVirtualAddress)
            expect(storageSystemFileAccess).toBe(null)
        }
    })
})