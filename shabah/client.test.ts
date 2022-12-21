import {describe, it, expect} from "vitest"
import {checkForUpdates, FetchFunction} from "./client"
import {ResultType, io} from "../monads/result"
import {CodeManifestSafe} from "../cargo/index"
import {LATEST_CRATE_VERSION} from "../cargo/consts"
import {nanoid} from "nanoid"

type FileRecord = Record<string, () => ResultType<Response>>
const requester = (files: FileRecord) => {
    const fileFetcher: FetchFunction = async (input, options) => {
        const url = ((i: typeof input) => {
            return i instanceof URL 
                ? i.href
                : i instanceof Request ? i.url : i
        })(input)
        if (options?.method?.toLowerCase() === "post") {
            files[url] = () => {
                return io.ok(new Response(options?.body?.toString() || "", {
                    status: 200,
                    statusText: "OK"
                }))
            }
            return io.ok(new Response("sucess", {status: 200, statusText: "OK"}))
        }
        const file = files[url]
        if (file) {
            try {
                return file()
            } catch (err) {
                return io.err(String(err))
            }
        }
        return io.ok(new Response("", {
            status: 404,
            statusText: "NOT FOUND"
        }))
    }
    return fileFetcher
}

const cargoPkg = new CodeManifestSafe({
    uuid: nanoid(CodeManifestSafe.UUID_LENGTH), 
    crateVersion: LATEST_CRATE_VERSION,
    version: "0.1.0", 
    name: "test-pkg", 
    entry: "index.js", 
    files: [{name: "index.js", bytes: 1_000}]
})

describe("diff cargos function", () => {
    it("if storage url request encounters fatal error no update urls are returned", async () => {
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                throw new Error("old cargo network error")
            }
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
    })

    it("if cargo has not been downloaded before and new cargo cannot be fetched due to network error no download urls should be returned", async () => {
        const fileFetcher = requester({
            "https://mywebsite.com/pkg/cargo.json": () => {
                throw new Error("new cargo network error")
            }
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
    })

    it("if cargo has not been downloaded before and new cargo cannot be fetched because http error occurred no download urls should be returned", async () => {
        const fileFetcher = requester({
            "https://mywebsite.com/pkg/cargo.json": () => {
                return io.ok(new Response("", {
                    status: 404,
                    statusText: "NOT FOUND"
                }))
            }
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
    })

    it("if cargo has not been downloaded before and new cargo is found but is not json-encoded no download urls should be returned", async () => {
        const fileFetcher = requester({
            "https://mywebsite.com/pkg/cargo.json": () => {
                const invalidJson = "{"
                return io.ok(new Response(invalidJson, {
                    status: 200,
                    statusText: "OK"
                }))
            }
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
    })

    it("if cargo has not been downloaded before and new cargo is found but is not a valid cargo.json no download urls should be returned", async () => {
        const fileFetcher = requester({
            "https://mywebsite.com/pkg/cargo.json": () => {
                const invalidCargo = `{"random-key": 2}`
                return io.ok(new Response(invalidCargo, {
                    status: 200,
                    statusText: "OK"
                }))
            }
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
    })

    it("if cargo has not been downloaded before and new cargo is found new cargo file urls should be returned", async () => {
        const manifest = cargoPkg.clone()
        const cargoString = JSON.stringify(manifest)
        
        const fileFetcher = requester({
            "https://mywebsite.com/pkg/cargo.json": () => {
                return io.ok(new Response(cargoString, {
                    status: 200,
                    statusText: "OK"
                }))
            }
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.downloadableResources.length).toBe(manifest.files.length)
        expect(res.errors.length).toBe(0)
        expect(res.resoucesToDelete.length).toBe(0)
        expect(res.bytesToDownload).toBeGreaterThan(0)
        expect(res.newCargos.length).toBeGreaterThan(0)
        expect(
            res.newCargos.some(c => (
                c.storageUrl === "https://local.com/store/cargo.json"
                && c.text === cargoString
            ))
        ).toBe(true)
        expect(res.previousVersionExists).toBe(false)
    })

    it("if previous cargo responds with error http that is not 404 should return no update urls", async () => {
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                return io.ok(new Response("", {
                    status: 403,
                    statusText: "FORBIDDEN"
                }))
            }
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
    })

    it("if previous cargo is found and new mini cargo version is not greater, no download urls should be returned and full new cargo should not be requested", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const requestRecord = {
            newCargoMini: 0,
            newCargo: 0
        }
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.mini.json": () => {
                requestRecord.newCargoMini++
                const pkg = JSON.stringify(newCargo.toMini())
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                requestRecord.newCargo++
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBe(0)
        expect(requestRecord.newCargoMini).toBeGreaterThan(0)
        expect(requestRecord.newCargo).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and fetching new mini cargo version cannot be fetched due to network error, full new cargo should be fetched as a fallback", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const requestRecord = {
            newCargoMini: 0,
            newCargo: 0
        }
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.mini.json": () => {
                requestRecord.newCargoMini++
                throw new Error("network error")
                const pkg = JSON.stringify(newCargo.toMini())
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                requestRecord.newCargo++
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(requestRecord.newCargoMini).toBeGreaterThan(0)
        expect(requestRecord.newCargo).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and fetching new mini cargo version cannot be fetched due to error http code returned, full new cargo should be fetched as a fallback", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const requestRecord = {
            newCargoMini: 0,
            newCargo: 0
        }
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.mini.json": () => {
                requestRecord.newCargoMini++
                return io.ok(new Response("", {
                    status: 403,
                    statusText: "FORBIDDEN"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                requestRecord.newCargo++
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(requestRecord.newCargoMini).toBeGreaterThan(0)
        expect(requestRecord.newCargo).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and fetching new cargo returns network error, no download links should be returned", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                throw new Error("network error")
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and fetching new cargo returns http error, no download links should be returned", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 500,
                    statusText: "INTERNAL SERVER ERROR"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and new cargo is not json encoded, no download links should be returned", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                // ruin the json encoding
                const pkg = JSON.stringify(newCargo) + "{"
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and new cargo is not a valid cargo json, no download links should be returned", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                const pkg = JSON.stringify({})
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and new cargo version is not greater, no download links and errors should be returned", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "2.1.2"
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.0"
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.errors.length).toBe(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and new cargo version is greater, download links not found in previous cargo, download links that are expired, and no errors should be returned", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "0.1.2"
        const expiredResources = [
            {name: "perf.3.wasm", bytes: 20_000, invalidation: "default"}
        ] as const
        oldCargo.files.push(...expiredResources)
        const newCargo = cargoPkg.clone()
        newCargo.version = "0.1.3"
        const newResources = [
            {name: "rand.5.js", bytes: 600, invalidation: "default"},
            {name: "styles.6.css", bytes: 1_100, invalidation: "default"},
        ] as const
        newCargo.files.push(...newResources)
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.errors.length).toBe(0)
        expect(res.downloadableResources.length).toBe(
            newResources.length
        )
        expect(res.resoucesToDelete.length).toBe(
            expiredResources.length
        )
        const cargoString = JSON.stringify(newCargo)
        expect(
            res.newCargos.some(c => (
                c.storageUrl === "https://local.com/store/cargo.json"
                && c.text === cargoString
            ))
        ).toBe(true)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and new cargo uuid mismatches old cargo's, no download links and errors should return", async () => {
        const oldCargo = cargoPkg.clone()
        oldCargo.version = "0.1.2"
        const expiredResources = [
            {name: "perf.3.wasm", bytes: 20_000, invalidation: "default"}
        ] as const
        oldCargo.files.push(...expiredResources)
        const newCargo = cargoPkg.clone()
        newCargo.uuid = nanoid(CodeManifestSafe.UUID_LENGTH)
        newCargo.version = "0.1.3"
        const newResources = [
            {name: "rand.5.js", bytes: 600, invalidation: "default"},
            {name: "styles.6.css", bytes: 1_100, invalidation: "default"},
        ] as const
        newCargo.files.push(...newResources)
        const fileFetcher = requester({
            "https://local.com/store/cargo.json": () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/cargo.json": () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const res = await checkForUpdates(
            {
                requestRootUrl: "https://mywebsite.com/pkg", 
                storageRootUrl: "https://local.com/store", 
                name: "pkg"
            }
        , fileFetcher, fileFetcher)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })
})