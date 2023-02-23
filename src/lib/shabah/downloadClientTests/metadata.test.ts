import { describe, it, expect } from "vitest"
import {Shabah} from "../downloadClient"
import {NO_UPDATE_QUEUED, UPDATING} from "../backend"
import {HuzmaManifest, MANIFEST_FILE_SUFFIX} from "huzma"
import { Permissions } from "../../types/permissions"
import {createClient, cargoToCargoIndex, createUpdateCheck} from "./testLib"

const MANIFEST_NAME = "stable" + MANIFEST_FILE_SUFFIX

describe("reading and updating cargo indexes", () => {
    it("cargo index can be created", async () => {
        const canonicalUrl = "https://mymamashouse.com"
        const {client} = createClient(canonicalUrl)
        const cargo = new HuzmaManifest<Permissions>({name: "my-cargo"})
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
        const initial = new HuzmaManifest<Permissions>({name: "my-cargo"})
        const index = cargoToCargoIndex(canonicalUrl, initial)
        await client.putCargoIndex(
            index,
        )
        const foundInitial = await client.getCargoIndexByCanonicalUrl(
            canonicalUrl
        )
        expect(foundInitial?.name).toBe(initial.name)
        const updated =  cargoToCargoIndex(canonicalUrl, new HuzmaManifest({name: "cargo"}))
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
        const initial = new HuzmaManifest<Permissions>({name: "my-cargo"})
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
        const initial = new HuzmaManifest<Permissions>({name: "my-cargo"})
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
        const initial = new HuzmaManifest<Permissions>({name: "my-cargo"})
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
        const initial = new HuzmaManifest<Permissions>({name: "my-cargo"})
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
        const cargoToDelete = new HuzmaManifest<Permissions>({
            name: "my-cargo",
            files: files as HuzmaManifest["files"]
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
            startedAt: Date.now(),
            segments: [
                {
                    resolvedUrl: canonicalUrl,
                    name: "",
                    canonicalUrl,
                    map: {},
                    version: "0.2.0",
                    previousVersion: "0.1.0",
                    bytes: 0,
                    resourcesToDelete: [],
                    downloadedResources: [],
                    canRevertToPreviousVersion: false
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
            startedAt: Date.now(),
            segments: [
                {
                    resolvedUrl: canonicalUrl,
                    canonicalUrl,
                    name: "",
                    map: {},
                    version: initialVersion,
                    previousVersion: "0.1.0",
                    bytes: 0,
                    resourcesToDelete: [],
                    downloadedResources: [],
                    canRevertToPreviousVersion: false
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
            startedAt: Date.now(),
            segments: [
                {
                    resolvedUrl: changedVersion,
                    canonicalUrl,
                    name: "",
                    map: {},
                    version: initialVersion,
                    previousVersion: "0.1.0",
                    bytes: 0,
                    resourcesToDelete: [],
                    downloadedResources: [],
                    canRevertToPreviousVersion: false
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
            startedAt: Date.now(),
            segments: [
                {
                    resolvedUrl: canonicalUrl,
                    canonicalUrl,
                    name: "",
                    map: {},
                    version: initialVersion,
                    previousVersion: "0.1.0",
                    bytes: 0,
                    resourcesToDelete: [],
                    downloadedResources: [],
                    canRevertToPreviousVersion: false
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
        const cargo = new HuzmaManifest<Permissions>({name: "good cargo"})
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
                newCargo: new HuzmaManifest(),
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