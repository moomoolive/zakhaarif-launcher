import {nanoid} from "nanoid"
import {describe, it, expect} from "vitest"
import {Cargo} from "../../cargo"
import {Permissions} from "../../types/permissions"
import {CACHED, FAILED, NO_UPDATE_QUEUED} from "../backend"
import {Shabah} from "../downloadClient"
import {createClient, cargoToCargoIndex} from "./testLib"

describe("consuming messages", () => {
    it("consuming messages should have no effect there are no messages waiting", async () => {
        const mainOrigin = "https://my-house.org"
        const tests = [
            {canonicalUrl: "https://cookies.yum/default.huzma.json"},
            {canonicalUrl: "https://milk.com/default.huzma.json"},
            {canonicalUrl: "https://lebron-sucks-at-basketball.org/default.huzma.json"},
        ] as const
        for (const {canonicalUrl} of tests) {
            const testClient = createClient(mainOrigin, {})
            const {client, internalCargoStore} = testClient
            const cargo = new Cargo<Permissions>({
                name: "pkg-" + Math.trunc(Math.random() * 1_000)
            })
            const cargoIndex = cargoToCargoIndex(canonicalUrl, cargo)
            await client.putCargoIndex(cargoIndex)
            const persistedCargoindex = await client.getCargoIndexByCanonicalUrl(
                canonicalUrl
            )
            expect(persistedCargoindex).not.toBe(null)
            expect(persistedCargoindex?.canonicalUrl).toBe(canonicalUrl)
            expect(await testClient.messageConsumer.getAllMessages()).length(0)
            const cargosBefore = structuredClone(Object.values(internalCargoStore))
            const consumeReponse = await client.consumeQueuedMessages()
            expect(consumeReponse).toBe(Shabah.STATUS.noMessagesFound)
            const cargosAfter = structuredClone(Object.values(internalCargoStore))
            expect(cargosBefore).toStrictEqual(cargosAfter)
        }
    })

    it("consuming messages that don't reference any known canonical urls should have no effect", async () => {
        const mainOrigin = "https://my-house.org"
        const tests = [
            {canonicalUrl: "https://cookies.yum/default.huzma.json"},
            {canonicalUrl: "https://milk.com/default.huzma.json"},
            {canonicalUrl: "https://lebron-sucks-at-basketball.org/default.huzma.json"},
        ] as const
        for (const {canonicalUrl} of tests) {
            const testClient = createClient(mainOrigin, {})
            const {client, internalCargoStore} = testClient
            const cargo = new Cargo<Permissions>({
                name: "pkg-" + Math.trunc(Math.random() * 1_000)
            })
            const cargoIndex = cargoToCargoIndex(canonicalUrl, cargo)
            await client.putCargoIndex(cargoIndex)
            const persistedCargoindex = await client.getCargoIndexByCanonicalUrl(
                canonicalUrl
            )
            expect(persistedCargoindex).not.toBe(null)
            expect(persistedCargoindex?.canonicalUrl).toBe(canonicalUrl)
            const downloadId = nanoid(6)
            testClient.clientMessages[downloadId] = ({
                id: downloadId,
                timestamp: Date.now(),
                downloadId,
                stateUpdates: [
                    {canonicalUrl: "https://random-site.com/.huzma.json", state: FAILED}
                ]
            })
            expect(await testClient.messageConsumer.getAllMessages()).length(1)
            const cargosBefore = structuredClone(Object.values(internalCargoStore))
            const consumeReponse = await client.consumeQueuedMessages()
            expect(consumeReponse).toBe(Shabah.STATUS.allMessagesAreOrphaned)
            const cargosAfter = structuredClone(Object.values(internalCargoStore))
            expect(cargosBefore).toStrictEqual(cargosAfter)
        }
    })

    it("consuming messages that reference both known and unknown canonical urls, should only update the state of known urls", async () => {
        const mainOrigin = "https://my-house.org"
        const tests = [
            {canonicalUrl: "https://cookies.yum/default.huzma.json"},
            {canonicalUrl: "https://milk.com/default.huzma.json"},
            {canonicalUrl: "https://lebron-sucks-at-basketball.org/default.huzma.json"},
        ] as const
        for (const {canonicalUrl} of tests) {
            const testClient = createClient(mainOrigin, {})
            const {client, internalCargoStore} = testClient
            const cargo = new Cargo<Permissions>({
                name: "pkg-" + Math.trunc(Math.random() * 1_000)
            })
            const cargoIndex = cargoToCargoIndex(canonicalUrl, cargo, {
                state: CACHED
            })
            await client.putCargoIndex(cargoIndex)
            const persistedCargoindex = await client.getCargoIndexByCanonicalUrl(
                canonicalUrl
            )
            expect(persistedCargoindex).not.toBe(null)
            expect(persistedCargoindex?.canonicalUrl).toBe(canonicalUrl)
            expect(persistedCargoindex?.state).toBe(CACHED)
            const downloadId = nanoid(6)
            testClient.clientMessages[downloadId] = ({
                id: downloadId,
                timestamp: Date.now(),
                downloadId,
                stateUpdates: [
                    {canonicalUrl: "https://random-site.com/.huzma.json", state: FAILED},
                    {canonicalUrl, state: FAILED},
                ]
            })
            expect(await testClient.messageConsumer.getAllMessages()).length(1)
            const cargoLength = Object.values(internalCargoStore).length
            const consumeReponse = await client.consumeQueuedMessages()
            expect(consumeReponse).toBe(Shabah.STATUS.someMessagesAreOrphaned)
            const currentLength = Object.values(internalCargoStore).length
            expect(cargoLength).toBe(currentLength)
            const persistedCargoindexAfter = await client.getCargoIndexByCanonicalUrl(
                canonicalUrl
            )
            expect(persistedCargoindexAfter).not.toBe(null)
            expect(persistedCargoindexAfter?.canonicalUrl).toBe(canonicalUrl)
            expect(persistedCargoindexAfter?.state).toBe(FAILED)         
        }
    })

    it(`consuming messages that reference both known canonical urls, should update the state of target and set download id to ${NO_UPDATE_QUEUED}`, async () => {
        const mainOrigin = "https://my-house.org"
        const tests = [
            {canonicalUrl: "https://cookies.yum/default.huzma.json"},
            {canonicalUrl: "https://milk.com/default.huzma.json"},
            {canonicalUrl: "https://lebron-sucks-at-basketball.org/default.huzma.json"},
        ] as const
        for (const {canonicalUrl} of tests) {
            const testClient = createClient(mainOrigin, {})
            const {client, internalCargoStore} = testClient
            const cargo = new Cargo<Permissions>({
                name: "pkg-" + Math.trunc(Math.random() * 1_000)
            })
            const downloadId = nanoid()
            const cargoIndex = cargoToCargoIndex(canonicalUrl, cargo, {
                state: CACHED,
                downloadId
            })
            await client.putCargoIndex(cargoIndex)
            const persistedCargoindex = await client.getCargoIndexByCanonicalUrl(
                canonicalUrl
            )
            expect(persistedCargoindex).not.toBe(null)
            expect(persistedCargoindex?.canonicalUrl).toBe(canonicalUrl)
            expect(persistedCargoindex?.state).toBe(CACHED)
            expect(persistedCargoindex?.downloadId).toBe(downloadId)
            testClient.clientMessages[downloadId] = {
                id: downloadId,
                timestamp: Date.now(),
                downloadId,
                stateUpdates: [{canonicalUrl, state: FAILED}]
            }
            expect(await testClient.messageConsumer.getAllMessages()).length(1)
            const cargoLength = Object.values(internalCargoStore).length
            const consumeReponse = await client.consumeQueuedMessages()
            expect(consumeReponse).toBe(Shabah.STATUS.messagesConsumed)
            const currentLength = Object.values(internalCargoStore).length
            expect(cargoLength).toBe(currentLength)
            const persistedCargoindexAfter = await client.getCargoIndexByCanonicalUrl(
                canonicalUrl
            )
            expect(persistedCargoindexAfter).not.toBe(null)
            expect(persistedCargoindexAfter?.canonicalUrl).toBe(canonicalUrl)
            expect(persistedCargoindexAfter?.state).toBe(FAILED)         
        }
    })

    it("multiple messages can be consumed at once", async () => {
        const mainOrigin = "https://my-house.org"
        const tests = [
            {
                canonicalUrl: "https://cookies.yum/default.huzma.json",
                extraCargos: [
                    "https://1.com/.huzma.json",
                    "https://2.com/.huzma.json"
                ]
            },
            {
                canonicalUrl: "https://milk.moo/default.huzma.json",
                extraCargos: [
                    "https://1.com/.huzma.json",
                    "https://2.com/.huzma.json",
                    "https://47.com/.huzma.json",
                ]
            },
            {
                canonicalUrl: "https://toro.sushi/default.huzma.json",
                extraCargos: [
                    "https://x-1.com/.huzma.json",
                ]
            },
        ] as const
        for (const {canonicalUrl, extraCargos} of tests) {
            const testClient = createClient(mainOrigin, {})
            const {client, internalCargoStore} = testClient
            const allUrls = [...extraCargos, canonicalUrl]
            for (const url of allUrls) {
                const cargo = new Cargo<Permissions>({
                    name: "pkg-" + Math.trunc(Math.random() * 1_000)
                })
                const downloadId = nanoid()
                const cargoIndex = cargoToCargoIndex(url, cargo, {
                    state: CACHED,
                    downloadId
                })
                await client.putCargoIndex(cargoIndex)
                const persistedCargoindex = await client.getCargoIndexByCanonicalUrl(
                    url
                )
                expect(persistedCargoindex).not.toBe(null)
                expect(persistedCargoindex?.canonicalUrl).toBe(url)
                expect(persistedCargoindex?.state).toBe(CACHED)
                expect(persistedCargoindex?.downloadId).toBe(downloadId)
                testClient.clientMessages[downloadId] = {
                    id: downloadId,
                    timestamp: Date.now(),
                    downloadId,
                    stateUpdates: [{canonicalUrl: url, state: FAILED}]
                }
            }
            
            expect(await testClient.messageConsumer.getAllMessages()).length(allUrls.length)
            const cargoLength = Object.values(internalCargoStore).length
            const consumeReponse = await client.consumeQueuedMessages()
            expect(consumeReponse).toBe(Shabah.STATUS.messagesConsumed)
            const currentLength = Object.values(internalCargoStore).length
            expect(cargoLength).toBe(currentLength)
            
            for (const url of allUrls) {
                const persistedCargoindexAfter = await client.getCargoIndexByCanonicalUrl(url)
                expect(persistedCargoindexAfter).not.toBe(null)
                expect(persistedCargoindexAfter?.canonicalUrl).toBe(url)
                expect(persistedCargoindexAfter?.state).toBe(FAILED)
                expect(persistedCargoindexAfter?.downloadId).toBe(NO_UPDATE_QUEUED) 
            }        
        }
    })

    it("consumed messages should be deleted after consumption", async () => {
        const mainOrigin = "https://my-house.org"
        const tests = [
            {
                canonicalUrl: "https://cookies.yum/default.huzma.json",
                extraCargos: [
                    "https://1.com/.huzma.json",
                    "https://2.com/.huzma.json"
                ]
            },
            {
                canonicalUrl: "https://milk.moo/default.huzma.json",
                extraCargos: [
                    "https://1.com/.huzma.json",
                    "https://2.com/.huzma.json",
                    "https://47.com/.huzma.json",
                ]
            },
            {
                canonicalUrl: "https://toro.sushi/default.huzma.json",
                extraCargos: [
                    "https://x-1.com/.huzma.json",
                ]
            },
        ] as const
        
        for (const {canonicalUrl, extraCargos} of tests) {
            const testClient = createClient(mainOrigin, {})
            const {client, internalCargoStore} = testClient
            const allUrls = [...extraCargos, canonicalUrl]
            for (const url of allUrls) {
                const cargo = new Cargo<Permissions>({
                    name: "pkg-" + Math.trunc(Math.random() * 1_000)
                })
                const cargoIndex = cargoToCargoIndex(url, cargo, {
                    state: CACHED
                })
                await client.putCargoIndex(cargoIndex)
                const persistedCargoindex = await client.getCargoIndexByCanonicalUrl(
                    url
                )
                expect(persistedCargoindex).not.toBe(null)
                expect(persistedCargoindex?.canonicalUrl).toBe(url)
                expect(persistedCargoindex?.state).toBe(CACHED)
                const downloadId = nanoid(6)
                testClient.clientMessages[downloadId] = {
                    id: downloadId,
                    timestamp: Date.now(),
                    downloadId,
                    stateUpdates: [{canonicalUrl: url, state: FAILED}]
                }
            }
            expect(await testClient.messageConsumer.getAllMessages()).length(allUrls.length)
            const consumeReponse = await client.consumeQueuedMessages()
            expect(consumeReponse).toBe(Shabah.STATUS.messagesConsumed)
            expect(await testClient.messageConsumer.getAllMessages()).length(0)
        }
    })
})