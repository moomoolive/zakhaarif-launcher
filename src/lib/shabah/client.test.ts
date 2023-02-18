import {describe, it, expect} from "vitest"
import {checkForUpdates, STATUS_CODES} from "./client"
import {FetchFunction, FileCache} from "./backend"
import {ResultType, io} from "../monads/result"
import {Cargo} from "../cargo/index"
import {LATEST_SCHEMA_VERSION} from "../cargo/index"
import { MANIFEST_FILE_SUFFIX } from "../cargo/index"

type FileRecord = Record<string, () => ResultType<Response>>

const MANIFEST_NAME = "default" + MANIFEST_FILE_SUFFIX

const fetchFnAndFileCache = (
    cacheFiles: FileRecord,
    networkFiles: FileRecord
) => {
    const fetchFn: FetchFunction = async (input) => {
        const url = ((i: typeof input) => {
            return i instanceof URL 
                ? i.href
                : i instanceof Request ? i.url : i
        })(input)
        
        const file = networkFiles[url]
        
        if (!file) {
            return new Response("", {
                status: 404,
                statusText: "NOT FOUND"
            })
        }

        const initalFile = file()
        if (!initalFile.ok) {
            throw new Error("should never be here!!")
        }
        let f = initalFile
        let resolvedUrl = url
        if (
            initalFile.data.status > 299
            && initalFile.data.status < 400
            && initalFile.data.headers.has("location")
        ) {
            const redirectUrl = initalFile.data.headers.get("location") || ""
            const redirectFile = networkFiles[redirectUrl]
            if (!redirectFile) {
                throw ("test case provided redirect but no file found at redirect. Url=" + redirectUrl)
            }
            const redirectResponse = redirectFile()
            if (!redirectResponse.ok) {
                throw new Error("should never be here!!")
            }
            f = redirectResponse
            resolvedUrl = redirectUrl
        }
        const response = f.data
        Object.defineProperty(response, "url", {
            value: resolvedUrl,
            enumerable: true
        })
        return response 
    }

    const fileCache: FileCache = {
        getFile: async (url) => {
            if (!cacheFiles[url]) {
                return null
            }
            const result = cacheFiles[url]()
            if (!result.ok) {
                return null
            }
            return result.data
        },
        putFile: async () => true,
        queryUsage: async () => ({usage: 0, quota: 0}),
        deleteFile: async () => true,
        deleteAllFiles: async () => true,
        listFiles: async () => [],
        isPersisted: async () => true,
        requestPersistence: async () => true
    }
    return [fetchFn, fileCache] as const
}

const cargoPkg = new Cargo({
    schema: LATEST_SCHEMA_VERSION,
    version: "0.1.0", 
    name: "test-pkg", 
    entry: "index.js", 
    files: [{name: "index.js", bytes: 1_000, invalidation: "url-diff"}]
})

describe("diff cargos function", () => {
    it("if inputted canonical url is not a valid url, an error should be returned", async () => {
        const tests = [
            "data:svg+xml:afdslasflaksfdasfd",
            "not-a-url",
            "heerroaokaldfjaslf",
            "plz-url"
        ] as const
        const adaptors = fetchFnAndFileCache({}, {})
        for (const canonicalUrl of tests) {
            const response = await checkForUpdates({
                canonicalUrl, 
                oldResolvedUrl: "",
                oldManifestName: ""
            }, ...adaptors)
            expect(response.code).toBe(STATUS_CODES.malformedUrl)
            expect(response.errors.length).toBeGreaterThan(0)
            expect(response.downloadableResources.length).toBe(0)
        }
    })

    it(`if inputted canonical url's file name does not end with manifest prefix ("${MANIFEST_FILE_SUFFIX}"), an error should be returned`, async () => {
        const tests = [
            "https://website.com/manifest.json",
            "https://website2.com/index.js",
            "https://papas-pizza.com/yes.hello.js",
        ] as const
        const adaptors = fetchFnAndFileCache({}, {})
        for (const canonicalUrl of tests) {
            const response = await checkForUpdates({
                canonicalUrl, 
                oldResolvedUrl: "",
                oldManifestName: ""
            }, ...adaptors)
            expect(response.code).toBe(STATUS_CODES.invalidManifestUrl)
            expect(response.errors.length).toBeGreaterThan(0)
            expect(response.downloadableResources.length).toBe(0)
        }
    })

    it("if cargo has not been downloaded before and new cargo cannot be fetched due to network error no download urls should be returned", async () => {
        const origin = "https://mywebsite.com/pkg"
        const adaptors = fetchFnAndFileCache({}, {
            [`${origin}/${MANIFEST_NAME}`]: () => {
                throw new Error("new cargo network error")
            }
        })
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const res = await checkForUpdates({
            canonicalUrl, 
            oldResolvedUrl: "",
            oldManifestName: ""
        }, ...adaptors)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
        expect(res.code).toBe(STATUS_CODES.networkError)
    })

    it("if cargo has not been downloaded before and new cargo cannot be fetched because http error occurred no download urls should be returned", async () => {
        const tests = [500, 403, 400, 401, 404] as const   

        for (const status of tests) {
            const origin = "https://mywebsite.com/pkg"
            const canonicalUrl = origin + "/" + MANIFEST_NAME
            const adaptors = fetchFnAndFileCache({}, {
                [canonicalUrl]: () => {
                    return io.ok(new Response("", {
                        status: status,
                        statusText: "NOT FOUND"
                    }))
                }
            })
            const res = await checkForUpdates({
                canonicalUrl, 
                oldResolvedUrl: "", 
                oldManifestName: ""
            }, ...adaptors)
            expect(res.downloadableResources.length).toBe(0)
            expect(res.errors.length).toBeGreaterThan(0)
            expect(res.previousVersionExists).toBe(false)
            if (status === 404) {
                expect(res.code).toBe(STATUS_CODES.remoteResourceNotFound)
            } else {
                expect(res.code).toBe(STATUS_CODES.badHttpCode)
            }
        }
    })

    it("if cargo has not been downloaded before and new cargo is found but is not json-encoded no download urls should be returned", async () => {
        const origin = "https://mywebsite.com/pkg"
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const adaptors = fetchFnAndFileCache({}, {
            [canonicalUrl]: () => {
                const invalidJson = "{"
                return io.ok(new Response(invalidJson, {
                    status: 200,
                    statusText: "OK"
                }))
            }
        })
        const res = await checkForUpdates(
            {
                canonicalUrl, 
                oldResolvedUrl: "", 
                oldManifestName: ""
            }
        , ...adaptors)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
        expect(res.code).toBe(STATUS_CODES.encodingNotAcceptable)
    })

    it("if cargo has not been downloaded before and new cargo is found but is not a valid manifest no download urls should be returned", async () => {
        const origin = "https://mywebsite.com/pkg"
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const adaptors = fetchFnAndFileCache({}, {
            [canonicalUrl]: () => {
                const invalidCargo = `{"random-key": 2}`
                return io.ok(new Response(invalidCargo, {
                    status: 200,
                    statusText: "OK"
                }))
            }
        })
        const res = await checkForUpdates(
            {
                canonicalUrl, 
                oldResolvedUrl: "",
                oldManifestName: "" 
            }
        , ...adaptors)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.previousVersionExists).toBe(false)
        expect(res.code).toBe(STATUS_CODES.invalidManifestEncoding)
    })

    it("if cargo has not been downloaded before and new cargo is found and new cargo file urls do not contain files, an error should be returned", async () => {
        const manifest = structuredClone(cargoPkg)
        const cargoString = JSON.stringify(manifest)
        const origin = "https://mywebsite.com/pkg"
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const adaptors = fetchFnAndFileCache({}, {
            [canonicalUrl]: () => {
                return io.ok(new Response(cargoString, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "Content-Length": "1",
                        "Content-Type": "application/json"
                    }
                }))
            },
            [`${origin}/index.js`]: () => {
                return io.ok(new Response(cargoString, {
                    status: 404,
                    statusText: "OK",
                    headers: {
                        "Content-Length": "1",
                        "Content-Type": "text/javascript"
                    }
                }))
            }
        })
        const res = await checkForUpdates({
            canonicalUrl, 
            oldResolvedUrl: "", 
            oldManifestName: ""
        }, ...adaptors)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.code).toBe(STATUS_CODES.preflightVerificationFailed)
    })

    it("if cargo has not been downloaded before and new cargo is found new cargo file urls return a network error, an error should be returned", async () => {
        const manifest = structuredClone(cargoPkg)
        const cargoString = JSON.stringify(manifest)
        
        const origin = "https://mywebsite.com/pkg"
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const adaptors = fetchFnAndFileCache({}, {
            [canonicalUrl]: () => {
                return io.ok(new Response(cargoString, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "Content-Length": "1",
                        "Content-Type": "application/json"
                    }
                }))
            },
            [`${origin}/index.js`]: () => {
                throw new Error("network error")
            }
        })
        const res = await checkForUpdates({
            canonicalUrl, 
            oldResolvedUrl: "", 
            oldManifestName: ""
        }, ...adaptors)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.code).toBe(STATUS_CODES.preflightVerificationFailed)
        expect(res.downloadableResources.length).toBe(0)
    })

    it("if cargo has not been downloaded before and new cargo is found new cargo file urls returns a valid http response without the 'content-length' header, an error should be returned", async () => {
        const manifest = structuredClone(cargoPkg)
        const cargoString = JSON.stringify(manifest)
        
        const origin = "https://mywebsite.com/pkg"
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const adaptors = fetchFnAndFileCache({}, {
            [canonicalUrl]: () => {
                return io.ok(new Response(cargoString, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "Content-Length": "1",
                        "Content-Type": "application/json"
                    }
                }))
            },
            [`${origin}/index.js`]: () => {
                return io.ok(new Response(cargoString, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        //"Content-Length": "1",
                        "Content-Type": "text/javascript"
                    }
                }))
            }
        })
        const res = await checkForUpdates({
            canonicalUrl, 
            oldResolvedUrl: "", 
            oldManifestName: ""
        }, ...adaptors)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.code).toBe(STATUS_CODES.preflightVerificationFailed)
        expect(res.downloadableResources.length).toBe(0)
    })


    it("if cargo has not been downloaded before and new cargo is found new cargo file urls should be returned", async () => {
        const manifest = structuredClone(cargoPkg)
        const cargoString = JSON.stringify(manifest)
        const origin = "https://mywebsite.com/pkg"
        
        const adaptors = fetchFnAndFileCache({}, {
            [`${origin}/${MANIFEST_NAME}`]: () => {
                return io.ok(new Response(cargoString, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "Content-Length": "1",
                        "Content-Type": "application/json"
                    }
                }))
            },
            [`${origin}/index.js`]: () => {
                return io.ok(new Response(cargoString, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "Content-Length": "1",
                        "Content-Type": "text/javascript"
                    }
                }))
            }
        })
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const res = await checkForUpdates({
            canonicalUrl,
            oldResolvedUrl: origin + "/",
            oldManifestName: MANIFEST_NAME
        }, ...adaptors)
        expect(res.downloadableResources.length).toBe(manifest.files.length)
        expect(res.errors.length).toBe(0)
        expect(res.resoucesToDelete.length).toBe(0)
        expect(res.bytesToDownload).toBeGreaterThan(0)
        expect(res.newCargo?.text).toBe(cargoString)
        expect(res.previousVersionExists).toBe(false)
        expect(res.code).toBe(STATUS_CODES.ok)
    })

    it("if cargo has not been downloaded before and new cargo is found new cargo file urls should be returned, with files of cargo corresponding to their 'content-length' header", async () => {
        const manifest = structuredClone(cargoPkg)
        const cargoString = JSON.stringify(manifest)
        const origin = "https://mywebsite.com/pkg"
        const contentLength = ["10"] as const
        const adaptors = fetchFnAndFileCache({}, {
            [`${origin}/${MANIFEST_NAME}`]: () => {
                return io.ok(new Response(cargoString, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "Content-Length": "1",
                        "Content-Type": "application/json"
                    }
                }))
            },
            [`${origin}/index.js`]: () => {
                return io.ok(new Response(cargoString, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "Content-Length": contentLength[0],
                        "Content-Type": "text/javascript"
                    }
                }))
            }
        })
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const res = await checkForUpdates(
            {
                canonicalUrl, 
                oldResolvedUrl: origin + "/", 
                oldManifestName: MANIFEST_NAME
            }
        , ...adaptors)
        expect(res.code).toBe(STATUS_CODES.ok)
        expect(res.downloadableResources.length).toBe(manifest.files.length)
        expect(res.errors.length).toBe(0)
        expect(res.resoucesToDelete.length).toBe(0)
        expect(res.bytesToDownload).toBe(parseInt(contentLength[0], 10))
        expect(res.newCargo?.parsed.files || []).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "index.js", 
                    bytes: parseInt(contentLength[0], 10),
                })
            ])
        )
    })

    it("passing in an empty string as resolvedUrl has the same effect as having not downloaded a cargo before", async () => {
        const manifest = structuredClone(cargoPkg)
        const cargoString = JSON.stringify(manifest)

        const origin = "https://mywebsite.com/pkg"
        const contentLength = ["10"] as const
        const adaptors = fetchFnAndFileCache({}, {
            [`${origin}/${MANIFEST_NAME}`]: () => {
                return io.ok(new Response(cargoString, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "Content-Length": "1",
                        "Content-Type": "application/json"
                    }
                }))
            },
            [`${origin}/index.js`]: () => {
                return io.ok(new Response(cargoString, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "Content-Length": contentLength[0],
                        "Content-Type": "text/javascript"
                    }
                }))
            }
        })
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const res = await checkForUpdates({
            canonicalUrl, 
            oldResolvedUrl: "", 
            oldManifestName: ""
        }, ...adaptors)
        expect(res.code).toBe(STATUS_CODES.ok)
        expect(res.downloadableResources.length).toBe(manifest.files.length)
        expect(res.errors.length).toBe(0)
        expect(res.resoucesToDelete.length).toBe(0)
        expect(res.bytesToDownload).toBe(parseInt(contentLength[0], 10))
        expect(res.newCargo?.parsed.files || []).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "index.js", 
                    bytes: parseInt(contentLength[0], 10),
                })
            ])
        )
    })

    it("if previous cargo is found and fetching new cargo returns network error, no download links should be returned", async () => {
        const oldCargo = structuredClone(cargoPkg)
        oldCargo.version = "2.1.2"
        const newCargo = structuredClone(cargoPkg)
        newCargo.version = "0.1.0"
        const origin = "https://mywebsite.com/pkg"
        const adaptors = fetchFnAndFileCache({
            [`${origin}/${MANIFEST_NAME}`]: () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        }, {
            [`${origin}/${MANIFEST_NAME}`]: () => {
                throw new Error("network error")
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const res = await checkForUpdates({
            canonicalUrl, 
            oldResolvedUrl: origin + "/", 
            oldManifestName: MANIFEST_NAME
        }, ...adaptors)
        expect(res.code).toBe(STATUS_CODES.networkError)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and fetching new cargo returns http error, no download links should be returned", async () => {
        const oldCargo = structuredClone(cargoPkg)
        oldCargo.version = "2.1.2"
        const newCargo = structuredClone(cargoPkg)
        newCargo.version = "0.1.0"
        const origin = "https://mywebsite.com/pkg"
        const adaptors = fetchFnAndFileCache({
            [`${origin}/${MANIFEST_NAME}`]: () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        }, {
            [`${origin}/${MANIFEST_NAME}`]: () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 500,
                    statusText: "INTERNAL SERVER ERROR"
                }))
            },
        })
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const res = await checkForUpdates({
            canonicalUrl, 
            oldResolvedUrl: origin + "/", 
            oldManifestName: MANIFEST_NAME
        }, ...adaptors)
        expect(res.code).toBe(STATUS_CODES.badHttpCode)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and new cargo is not json encoded, no download links should be returned", async () => {
        const oldCargo = structuredClone(cargoPkg)
        oldCargo.version = "2.1.2"
        const newCargo = structuredClone(cargoPkg)
        newCargo.version = "0.1.0"
        const origin = "https://mywebsite.com/pkg"
        const adaptors = fetchFnAndFileCache({
            [`${origin}/${MANIFEST_NAME}`]: () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        }, {
            [`${origin}/${MANIFEST_NAME}`]: () => {
                // ruin the json encoding
                const pkg = JSON.stringify(newCargo) + "{"
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const res = await checkForUpdates(
            {
                canonicalUrl, 
                oldResolvedUrl: origin + "/", 
                oldManifestName: MANIFEST_NAME
            }
        , ...adaptors)
        expect(res.code).toBe(STATUS_CODES.encodingNotAcceptable)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and new cargo is not a valid cargo json, no download links should be returned", async () => {
        const oldCargo = structuredClone(cargoPkg)
        oldCargo.version = "2.1.2"
        const newCargo = structuredClone(cargoPkg)
        newCargo.version = "0.1.0"
        const origin = "https://mywebsite.com/pkg"
        const adaptors = fetchFnAndFileCache({
            [`${origin}/${MANIFEST_NAME}`]: () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        }, {
            [`${origin}/${MANIFEST_NAME}`]: () => {
                const pkg = JSON.stringify({})
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const res = await checkForUpdates(
            {
                canonicalUrl, 
                oldResolvedUrl: origin + "/", 
                oldManifestName: MANIFEST_NAME
            }
        , ...adaptors)
        expect(res.code).toBe(STATUS_CODES.invalidManifestEncoding)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and new cargo version is not greater, no download links and errors should be returned", async () => {
        const oldCargo = structuredClone(cargoPkg)
        oldCargo.version = "2.1.2"
        const newCargo = structuredClone(cargoPkg)
        newCargo.version = "0.1.0"
        const origin = "https://mywebsite.com/pkg"
        const adaptors = fetchFnAndFileCache({
            [`${origin}/${MANIFEST_NAME}`]: () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        }, {
            [`${origin}/${MANIFEST_NAME}`]: () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        })
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const res = await checkForUpdates(
            {
                canonicalUrl, 
                oldResolvedUrl: origin + "/", 
                oldManifestName: MANIFEST_NAME
            }
        , ...adaptors)
        expect(res.code).toBe(STATUS_CODES.manifestIsUpToDate)
        expect(res.errors.length).toBe(0)
        expect(res.downloadableResources.length).toBe(0)
        expect(res.previousVersionExists).toBe(true)
    })

    it("if previous cargo is found and new cargo version is greater, and new download links return with a network error, an error should be returned", async () => {
        const oldCargo = structuredClone(cargoPkg)
        oldCargo.version = "0.1.2"
        const expiredResources = [
            {name: "perf.3.wasm", bytes: 20_000, invalidation: "default"}
        ] as const
        oldCargo.files.push(...expiredResources)
        const newCargo = structuredClone(cargoPkg)
        newCargo.version = "0.1.3"
        const newResources = [
            {name: "rand.5.js", bytes: 600, invalidation: "default"},
            {name: "styles.6.css", bytes: 1_100, invalidation: "default"},
        ] as const
        newCargo.files.push(...newResources)
        const origin = "https://mywebsite.com/pkg"
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const adaptors = fetchFnAndFileCache({
            [canonicalUrl]: () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        }, {
            [canonicalUrl]: () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            [`${origin}/rand.5.js`]: () => {
                return io.ok(new Response("", {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "content-length": "1",
                        "content-type": "text/javascript"
                    }
                }))
            },
            [`${origin}/styles.6.css`]: () => {
                throw new Error("network error")
            }
        })
        const res = await checkForUpdates({
            canonicalUrl, 
            oldResolvedUrl: origin + "/", 
            oldManifestName: MANIFEST_NAME
        }, ...adaptors)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.code).toBe(STATUS_CODES.preflightVerificationFailed)
    })

    it("if previous cargo is found and new cargo version is greater, and new download links return with an error http-code, an error should be returned", async () => {
        const oldCargo = structuredClone(cargoPkg)
        oldCargo.version = "0.1.2"
        const expiredResources = [
            {name: "perf.3.wasm", bytes: 20_000, invalidation: "default"}
        ] as const
        oldCargo.files.push(...expiredResources)
        const newCargo = structuredClone(cargoPkg)
        newCargo.version = "0.1.3"
        const newResources = [
            {name: "rand.5.js", bytes: 600, invalidation: "default"},
            {name: "styles.6.css", bytes: 1_100, invalidation: "default"},
        ] as const
        newCargo.files.push(...newResources)
        const origin = "https://mywebsite.com/pkg"
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const adaptors = fetchFnAndFileCache({
            [canonicalUrl]: () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        }, {
            [canonicalUrl]: () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            [`${origin}/rand.5.js`]: () => {
                return io.ok(new Response("", {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "content-length": "1",
                        "content-type": "text/javascript"
                    }
                }))
            },
            [`${origin}/styles.6.css`]: () => {
                return io.ok(new Response("", {
                    status: 404,
                    statusText: "OK",
                    headers: {
                        "content-length": "1",
                        "content-type": "text/css"
                    }
                }))
            }
        })
        const res = await checkForUpdates({
            canonicalUrl, 
            oldResolvedUrl: origin + "/",
            oldManifestName: MANIFEST_NAME 
        }, ...adaptors)
        expect(res.errors.length).toBeGreaterThan(0)
        expect(res.code).toBe(STATUS_CODES.preflightVerificationFailed)
    })

    it("if previous cargo is found and new cargo version is greater, and new download links return without the 'content-length' header, an error should be returned", async () => {
        const oldCargo = structuredClone(cargoPkg)
        oldCargo.version = "0.1.2"
        const expiredResources = [
            {name: "perf.3.wasm", bytes: 20_000, invalidation: "default"}
        ] as const
        oldCargo.files.push(...expiredResources)
        const newCargo = structuredClone(cargoPkg)
        newCargo.version = "0.1.3"
        const newResources = [
            {name: "rand.5.js", bytes: 600, invalidation: "default"},
            {name: "styles.6.css", bytes: 1_100, invalidation: "default"},
        ] as const
        newCargo.files.push(...newResources)
        const origin = "https://mywebsite.com/pkg"
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const adaptors = fetchFnAndFileCache({
            [canonicalUrl]: () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        }, {
            [canonicalUrl]: () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            [`${origin}/rand.5.js`]: () => {
                return io.ok(new Response("", {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "content-length": "1",
                        "content-type": "text/javascript"
                    }
                }))
            },
            [`${origin}/styles.6.css`]: () => {
                return io.ok(new Response("", {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        //"content-length": "1",
                        "content-type": "text/css"
                    }
                }))
            }
        })
        const res = await checkForUpdates({
            canonicalUrl, 
            oldResolvedUrl: origin + "/",
            oldManifestName: MANIFEST_NAME
        }, ...adaptors)
        expect(res.code).toBe(STATUS_CODES.preflightVerificationFailed)
        expect(res.errors.length).toBeGreaterThan(0)
    })

    it("if previous cargo is found and new cargo version is greater, download links not found in previous cargo, download links that are expired, and no errors should be returned", async () => {
        const oldCargo = structuredClone(cargoPkg)
        oldCargo.version = "0.1.2"
        const expiredResources = [
            {name: "perf.3.wasm", bytes: 20_000, invalidation: "default"}
        ] as const
        oldCargo.files.push(...expiredResources)
        const newCargo = structuredClone(cargoPkg)
        newCargo.version = "0.1.3"
        const newResources = [
            {name: "rand.5.js", bytes: 600, invalidation: "default"},
            {name: "styles.6.css", bytes: 1_100, invalidation: "default"},
        ] as const
        newCargo.files.push(...newResources)
        const origin = "https://mywebsite.com/pkg"
        const adaptors = fetchFnAndFileCache({
            [`${origin}/${MANIFEST_NAME}`]:  () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            }
        }, {
            [`${origin}/${MANIFEST_NAME}`]: () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            [`${origin}/rand.5.js`]: () => {
                return io.ok(new Response("", {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "content-length": "1",
                        "content-type": "text/javascript"
                    }
                }))
            },
            [`${origin}/styles.6.css`]: () => {
                return io.ok(new Response("", {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "content-length": "1",
                        "content-type": "text/css"
                    }
                }))
            }
        })
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const res = await checkForUpdates(
            {
                canonicalUrl, 
                oldResolvedUrl: origin + "/", 
                oldManifestName: MANIFEST_NAME
            }
        , ...adaptors)
        expect(res.errors.length).toBe(0)
        expect(res.downloadableResources.length).toBe(
            newResources.length
        )
        expect(res.resoucesToDelete.length).toBe(
            expiredResources.length
        )
        const cargoString = JSON.stringify(newCargo)
        expect(res.newCargo?.text).toBe(cargoString)
        expect(res.previousVersionExists).toBe(true)
        expect(res.code).toBe(STATUS_CODES.ok)
    })

    it("if previous cargo is found and new cargo version is greater, no errors should be returned and correct bytes to download should be calculated", async () => {
        const oldCargo = structuredClone(cargoPkg)
        oldCargo.version = "0.1.2"
        const expiredResources = [
            {name: "perf.3.wasm", bytes: 20_000, invalidation: "default"}
        ] as const
        oldCargo.files.push(...expiredResources)
        const newCargo = structuredClone(cargoPkg)
        newCargo.version = "0.1.3"
        const newResources = [
            {name: "rand.5.js", bytes: 600, invalidation: "default"},
            {name: "styles.6.css", bytes: 1_100, invalidation: "default"},
        ] as const
        newCargo.files.push(...newResources)
        const contentLengths = ["20", "100"] as const
        const origin = "https://mywebsite.com/pkg"
        const adaptors = fetchFnAndFileCache({
            [`${origin}/${MANIFEST_NAME}`]: () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        }, {
            [`${origin}/${MANIFEST_NAME}`]: () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            "https://mywebsite.com/pkg/rand.5.js": () => {
                return io.ok(new Response("", {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "content-length": contentLengths[0],
                        "content-type": "text/javascript"
                    }
                }))
            },
            "https://mywebsite.com/pkg/styles.6.css": () => {
                return io.ok(new Response("", {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "content-length": contentLengths[1],
                        "content-type": "text/css"
                    }
                }))
            }
        })
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const res = await checkForUpdates(
            {
                canonicalUrl, 
                oldResolvedUrl: origin + "/", 
                oldManifestName: MANIFEST_NAME
            }
        , ...adaptors)
        expect(res.errors.length).toBe(0)
        expect(res.downloadableResources.length).toBe(
            newResources.length
        )
        expect(res.code).toBe(STATUS_CODES.ok)
        expect(res.resoucesToDelete.length).toBe(
            expiredResources.length
        )
        expect(res.newCargo?.parsed.files || []).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "rand.5.js",
                    bytes: parseInt(contentLengths[0], 10)
                }),
                expect.objectContaining({
                    name: "styles.6.css",
                    bytes: parseInt(contentLengths[1], 10)
                }),
                expect.objectContaining({
                    name: "index.js",
                    bytes: 1000
                })
            ])
        )
        expect(res.bytesToDownload).toBe(
            contentLengths
                .map((length) => parseInt(length, 10))
                .reduce((total, next) => total + next, 0)
        )
    })

    it("if previous cargo is found and new cargo version is greater, and canonical url resolves to a different url than input 'resolvedUrl', reinstallation should occur (purge all old files, download all files in new package)", async () => {
        const oldCargo = structuredClone(cargoPkg)
        oldCargo.version = "0.1.2"
        const expiredResources = [
            {name: "perf.3.wasm", bytes: 20_000, invalidation: "default"}
        ] as const
        oldCargo.files.push(...expiredResources)
        const newCargo = structuredClone(cargoPkg)
        newCargo.version = "0.1.3"
        const newResources = [
            {name: "rand.5.js", bytes: 600, invalidation: "default"},
            {name: "styles.6.css", bytes: 1_100, invalidation: "default"},
        ] as const
        newCargo.files.push(...newResources)

        const contentLengths = ["20", "100", "1000"] as const
        const redirecturl = "https://assets.mywebsite.com"
        const origin = "https://mywebsite.com/pkg"
        const adaptors = fetchFnAndFileCache({
            [`${origin}/${MANIFEST_NAME}`]: () => {
                const pkg = JSON.stringify(oldCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
        }, {
            [`${origin}/${MANIFEST_NAME}`]: () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 302,
                    statusText: "OK",
                    headers: {
                        "location": `${redirecturl}/pkg/${MANIFEST_NAME}`
                    }
                }))
            },
            [`${redirecturl}/pkg/${MANIFEST_NAME}`]: () => {
                const pkg = JSON.stringify(newCargo)
                return io.ok(new Response(pkg, {
                    status: 200,
                    statusText: "OK"
                }))
            },
            [`${redirecturl}/pkg/rand.5.js`]: () => {
                return io.ok(new Response("", {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "content-length": contentLengths[0],
                        "content-type": "text/javascript"
                    }
                }))
            },
            [`${redirecturl}/pkg/styles.6.css`]: () => {
                return io.ok(new Response("", {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "content-length": contentLengths[1],
                        "content-type": "text/css"
                    }
                }))
            },
            [`${redirecturl}/pkg/index.js`]: () => {
                return io.ok(new Response("", {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "content-length": contentLengths[2],
                        "content-type": "text/css"
                    }
                }))
            },
        })
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const res = await checkForUpdates({
            canonicalUrl, 
            oldResolvedUrl: origin + "/", 
            oldManifestName: MANIFEST_NAME
        }, ...adaptors)
        expect(res.code).toBe(STATUS_CODES.ok)
        expect(res.errors.length).toBe(0)
        expect(res.downloadableResources.length).toBe(
            newCargo.files.length
        )
        expect(res.resoucesToDelete.length).toBe(
            oldCargo.files.length
        )
        expect(res.newCargo?.parsed.files || []).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "rand.5.js",
                    bytes: parseInt(contentLengths[0], 10)
                }),
                expect.objectContaining({
                    name: "styles.6.css",
                    bytes: parseInt(contentLengths[1], 10)
                }),
                expect.objectContaining({
                    name: "index.js",
                    bytes: 1000
                })
            ])
        )
        expect(res.bytesToDownload).toBe(
            contentLengths
                .map((length) => parseInt(length, 10))
                .reduce((total, next) => total + next, 0)
        )
    })

    it("if request for cargo is redirected to another url, all cargo files will be requested with redirected root url", async () => {
        const manifest = structuredClone(cargoPkg)
        const cargoString = JSON.stringify(manifest)

        const contentLength = ["10"] as const
        const redirectOrigin = "https://assets.mywebsites.com/pkg"
        const redirectCargo = `${redirectOrigin}/${MANIFEST_NAME}`
        const origin = "https://mywebsite.com/pkg"
        const adaptors = fetchFnAndFileCache({}, {
            [`${origin}/${MANIFEST_NAME}`]: () => {
                return io.ok(new Response(cargoString, {
                    status: 302,
                    statusText: "OK",
                    headers: {
                        "location": redirectCargo
                    }
                }))
            },
            [redirectCargo]: () => {
                return io.ok(new Response(cargoString, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "Content-Length": "1",
                        "Content-Type": "application/json"
                    }
                }))
            },
            [`${redirectOrigin}/index.js`]: () => {
                return io.ok(new Response(cargoString, {
                    status: 200,
                    statusText: "OK",
                    headers: {
                        "Content-Length": contentLength[0],
                        "Content-Type": "text/javascript"
                    }
                }))
            }
        })
        const canonicalUrl = origin + "/" + MANIFEST_NAME
        const res = await checkForUpdates({
                canonicalUrl, 
                oldResolvedUrl: "", 
                oldManifestName: ""
        }, ...adaptors)
        expect(res.code).toBe(STATUS_CODES.ok)
        expect(res.downloadableResources.length).toBe(manifest.files.length)
        expect(res.downloadableResources).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    requestUrl: `${redirectOrigin}/index.js`,
                    storageUrl: `${redirectOrigin}/index.js`,
                    bytes: parseInt(contentLength[0], 10),
                })
            ])
        )
        expect(res.errors.length).toBe(0)
        expect(res.resoucesToDelete.length).toBe(0)
        expect(res.bytesToDownload).toBe(parseInt(contentLength[0], 10))
        expect(res.newCargo?.parsed.files || []).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "index.js", 
                    bytes: parseInt(contentLength[0], 10),
                })
            ])
        )
    })
})
