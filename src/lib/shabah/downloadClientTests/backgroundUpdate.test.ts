import { describe, it, expect } from "vitest"
import {Shabah} from "../downloadClient"
import {CACHED, NO_UPDATE_QUEUED, UPDATING} from "../backend"
import { 
    HuzmaManifest, 
    MANIFEST_FILE_SUFFIX, 
    NULL_FIELD 
} from "huzma"
import {createClient, createUpdateCheck} from "./testLib"

const MANIFEST_NAME = "stable" + MANIFEST_FILE_SUFFIX

describe("executing background updates", () => {
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
        expect(queueResponse.data).toBe(Shabah.STATUS.updateNotAvailable)
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
                newCargo: new HuzmaManifest(),
                originalNewCargoResponse: new Response(),
                
                    downloadableResources,
                    resourcesToDelete: []
                
            })
            await client.putDownloadIndex({
                id: "tmp",
                previousId: "",
                bytes: 0,
                title: "update 1",
                startedAt: Date.now(),
                segments: [
                    {
                        resolvedUrl: updateResponse.resolvedUrl,
                        canonicalUrl: updateResponse.canonicalUrl,
                        name: "",
                        map: {},
                        version: "0.2.0",
                        previousVersion: "0.1.0",
                        bytes: 0,
                        resourcesToDelete: [],
                        downloadedResources: [],
                        canRevertToPreviousVersion: false,
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

    it("if update is valid, a download and cargo index should be created, and manifest should be cached", async () => {
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
            const canonicalUrl = origin + "/" + MANIFEST_NAME
            const resolvedUrl = origin + "/"
            const {client, downloadState, caches: {innerFileCache}} = createClient(origin, {
                cacheFiles: {},
                networkFiles: {},
            })
            expect(downloadState.queuedDownloads.length).toBe(0)
            const updateResponse = createUpdateCheck({
                status: Shabah.STATUS.ok,
                tag: 0,
                originalResolvedUrl: resolvedUrl,
                resolvedUrl,
                canonicalUrl,
                diskInfo: storage,
                newCargo: new HuzmaManifest({entry: "index.js"}),
                originalNewCargoResponse: new Response(),
                downloadableResources,
                resourcesToDelete: [],
                manifestName: MANIFEST_NAME
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
            expect(cargoIndex?.state).toBe(UPDATING)
            expect(cargoIndex?.entry).toBe(ENTRY_NAME)
            expect(innerFileCache.getFile(updateResponse.resolvedUrl + MANIFEST_NAME)).not.toBe(undefined)
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
                
                    tag: 0,
                    originalResolvedUrl: canonicalUrl,
                    resolvedUrl: canonicalUrl,
                    canonicalUrl,
                
                diskInfo: storage,
                newCargo: new HuzmaManifest({entry: NULL_FIELD}),
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
            expect(cargoIndex?.state).toBe(UPDATING)
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
                tag: 0,
                originalResolvedUrl: canonicalUrl,
                resolvedUrl: canonicalUrl,
                canonicalUrl,
                diskInfo: storage,
                newCargo: new HuzmaManifest(),
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
                const canonicalUrl = origin + "/" + MANIFEST_NAME
                const resolvedUrl = origin + "/"
                const response = createUpdateCheck({
                    status: Shabah.STATUS.ok,
                    tag: 0,
                    originalResolvedUrl: resolvedUrl,
                    resolvedUrl,
                    canonicalUrl,
                    diskInfo: storage,
                    newCargo: new HuzmaManifest(),
                    originalNewCargoResponse: new Response(),
                    downloadableResources,
                    resourcesToDelete,
                    manifestName: MANIFEST_NAME
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
                const canonicalUrl = origin + "/" + MANIFEST_NAME
                const foundCargo = await client.getCargoIndexByCanonicalUrl(
                    canonicalUrl 
                )
                expect(!!foundCargo).toBe(true)
                expect(foundCargo?.state).toBe(UPDATING)
                const downloadId = downloadState.queuedDownloads[0].id
                expect(foundCargo?.downloadId).toBe(downloadId)

                const foundDownloadIndex = await client.getDownloadIndexByCanonicalUrl(
                    canonicalUrl
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
                    tag: 0,
                    originalResolvedUrl: canonicalUrl,
                    resolvedUrl: canonicalUrl,
                    canonicalUrl,
                    diskInfo: {used: 100, total: 20_000, left: 19_900},
                    newCargo: new HuzmaManifest(),
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
                expect(cargoIndex?.state).toBe(CACHED)
                expect(cargoIndex?.downloadId).toBe(NO_UPDATE_QUEUED)
                
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
