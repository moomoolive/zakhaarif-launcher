import { describe, it, expect } from "vitest"
import {Shabah} from "../downloadClient"
import {CACHED, DownloadSegment, FAILED, getErrorDownloadIndex, NO_UPDATE_QUEUED, ResourceMap, saveErrorDownloadIndex, UPDATING} from "../backend"
import { Cargo} from "../../cargo"
import { Permissions } from "../../types/permissions"
import {createClient, cargoToCargoIndex} from "./testLib"

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
                expect(queueResponse.data).toBe(Shabah.STATUS.remoteResourceNotFound)
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
                expect(cargoIndexFound?.state).toBe(CACHED)
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
                    {state: FAILED}
                )
                await client.putCargoIndex(cargoIndex)
                const cargoIndexFound = await client.getCargoIndexByCanonicalUrl(
                    canonicalUrl
                )
                expect(!!cargoIndexFound).toBe(true)
                expect(cargoIndexFound?.state).toBe(FAILED)
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
                    {state: FAILED}
                )
                await client.putCargoIndex(cargoIndex)
                const cargoIndexFound = await client.getCargoIndexByCanonicalUrl(
                    canonicalUrl
                )
                expect(!!cargoIndexFound).toBe(true)
                expect(cargoIndexFound?.state).toBe(FAILED)
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
                expect(cargoIndexFoundAfterMutation?.state).toBe(UPDATING)
                expect(cargoIndexFoundAfterMutation?.downloadId).toBe(downloadState.queuedDownloads[0].id)
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
                    {state: FAILED}
                )
                await client.putCargoIndex(cargoIndex)
                const cargoIndexFound = await client.getCargoIndexByCanonicalUrl(
                    canonicalUrl
                )
                expect(!!cargoIndexFound).toBe(true)
                expect(cargoIndexFound?.state).toBe(FAILED)
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
                    expect(cargoIndexFoundAfterMutation?.state).toBe(UPDATING)
                    expect(cargoIndexFoundAfterMutation?.downloadId).toBe(downloadState.queuedDownloads[0].id)
                    const errorIndexAfterMutation = await getErrorDownloadIndex(
                        resolvedUrl, adaptors.fileCache
                    )
                    expect(!!errorIndexAfterMutation).toBe(false)
                }
            }
            
        }
    })
})
