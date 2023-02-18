import type {
    ThreadSafeMessageChannel,
    UniqueMessage,
    ClientMessageChannel,
    BackendMessageChannel
} from "../shabah/backend"
import {messageUrl} from "../shabah/serviceWorker/mainThreadCommunication"


function createMessageChannel<
    Message extends UniqueMessage
>(name: string): ThreadSafeMessageChannel<Message> {
    const cacheName = name
    return {
        createMessage: async (message) => {
            const url = messageUrl(message.id)
            const cache = await caches.open(cacheName)
            await cache.put(url, new Response(JSON.stringify(message), {
                status: 200,
                statusText: "OK"
            }))
            return true
        },
        getAllMessages: async () => {
            const cache = await caches.open(cacheName)
            const keys = await cache.keys()
            const promises = []
            for (let i = 0; i < keys.length; i++) {
                const request = keys[i]
                const promise = cache.match(request.url)
                promises.push(promise)
            }
            const fileResponses = await Promise.all(promises)
            const parsePromises = []
            for (let i = 0; i < fileResponses.length; i++) {
                const response = fileResponses[i]
                if (!response) {
                    continue
                }
                parsePromises.push(response.json() as Promise<Message>)
            }
            return Promise.all(parsePromises)
        },
        getMessage: async (id) => {
            const url = messageUrl(id)
            const cache = await caches.open(cacheName)
            const file = await cache.match(url)
            if (!file) {
                return null
            }
            return await file.json() as Message
        },
        deleteMessage: async (id) => {
            const url = messageUrl(id)
            const cache = await caches.open(cacheName)
            await cache.delete(url)
            return true
        },
        deleteAllMessages: async () => {
            await caches.delete(cacheName)
            return true
        }
    }
}

export const createClientChannel: (name: string) => ClientMessageChannel = createMessageChannel
export const createBackendChannel: (name: string) => BackendMessageChannel = createMessageChannel