import {describe, it, expect} from "vitest"
import {Shabah} from "../downloadClient"
import {Cargo, MANIFEST_FILE_SUFFIX, } from "../../cargo"
import {Permissions} from "../../types/permissions"
import {SemVer} from "small-semver"
import {createClient, cargoToCargoIndex} from "./testLib"

const MANIFEST_NAME = "stable" + MANIFEST_FILE_SUFFIX

const mockCargo = new Cargo<Permissions>({
    name: "test",
    version: "0.1.0",
    schema: "0.1.0",
    files: [],
})

describe("initialization", () => {
    it("should throw exception if origin is not a full url", () => {
        const fail = (origin: string) => {
            return () => createClient(origin, {})
        }
        expect(fail("")).toThrow()
        expect(fail("data:svg+xml:adfasflkasldjfk")).toThrow()
        expect(fail("/mydomain")).toThrow()
        expect(fail("/relative_url")).toThrow()
    })
})

const badHttpResponse = (status = 0) => {
    return () => new Response("", {status: 404})
}
const networkError = () => {
    return () => {
        throw new Error("network error")
        return new Response("", {status: 200})
    }
}
const okResponse = ({status = 200, body = "", length = 0} = {}) => {
    return () => new Response(body, {
        status,
        headers: {"content-length": length.toString()}
    })
}

describe("checking for cargo updates", () => {
    it("should return error if canonicalUrl of manifest is not a full url", async () => {
        const origin = "https://my-house.org"
        const {client} = createClient(origin, {})
        const cases = [
            {canonicalUrl: "", tag: 0},
            {canonicalUrl: "data:svg+xml:asdfasf", tag: 0},
            {canonicalUrl: "/yes", tag: 0},
            {canonicalUrl: "./relative", tag: 0},
        ] as const
        for (const c of cases) {
            const response = await client.checkForUpdates(c)
            expect(response.errorOccurred()).toBe(true)
            expect(response.status).toBe(Shabah.STATUS.malformedUrl)
        }
    })

    it(`should return error if file at canonicalUrl does not end with "${MANIFEST_FILE_SUFFIX}"`, async () => {
        const origin = "https://my-house.org"
        const {client} = createClient(origin, {})
        const cases = [
            {canonicalUrl: "https://yo-mama.com/package.json", tag: 0},
            {canonicalUrl: "https://yo-mama.com/index.js", tag: 0},
            {canonicalUrl: "https://papa.com/pkg.css", tag: 0},
        ] as const
        for (const c of cases) {
            const response = await client.checkForUpdates(c)
            expect(response.errorOccurred()).toBe(true)
            expect(response.status).toBe(Shabah.STATUS.invalidManifestUrl)
        }
    })

    it("if http error encountered when requesting new cargo, errorOccurred should be true", async () => {
        type TestConfig = {
            cargoOrigin: string
            errorType: "network" | "bad-http"
            previousCargo?: () => null | Response
            newCargo: () => null | Response
        }
        const initTestCase = ({
            cargoOrigin,
            errorType,
            newCargo,
            previousCargo
        }: TestConfig) => {
            const networkFiles = newCargo 
                ? {[`${cargoOrigin}/${MANIFEST_NAME}`]: newCargo}
                : {}
            const cacheFiles = previousCargo
                ? {[`${cargoOrigin}/${MANIFEST_NAME}`]: previousCargo}
                : {}
            return {networkFiles, cacheFiles, errorType}
        }
        const cargoOrigin = `https://cargo-house.repo/pkg`
        const cases = [
            initTestCase({
                cargoOrigin,
                errorType: "network", 
                newCargo: () => {
                    throw new Error("network error")
                    return new Response("")
                }
            }),
            initTestCase({
                cargoOrigin,
                errorType: "bad-http", 
                newCargo: () => {
                    return new Response("", {status: 400})
                }
            }),
            initTestCase({
                cargoOrigin,
                errorType: "network",
                newCargo: () => {
                    throw new Error("network error")
                    return new Response("")
                },
                previousCargo: () => {
                    return new Response(JSON.stringify(mockCargo), {
                        status: 200
                    })
                }
            }),
            initTestCase({
                cargoOrigin,
                errorType: "bad-http",
                newCargo: () => {
                    return new Response("", {status: 500})
                },
                previousCargo: () => {
                    return new Response(JSON.stringify(mockCargo), {
                        status: 200
                    })
                }
            }),
        ] as const
        const origin = "https://my-house.org"
        for (const {networkFiles, cacheFiles, errorType} of cases) {
            const {client} = createClient(origin, {
                networkFiles, cacheFiles
            })
            const perviousCargoExists = Object.keys(cacheFiles).length > 0
            const canonicalUrl = cargoOrigin + "/" + MANIFEST_NAME
            if (perviousCargoExists) {
                const cargoUrl = Object.keys(cacheFiles)[0]
                await client.putCargoIndex(
                    cargoToCargoIndex(
                        canonicalUrl,
                        await (cacheFiles[cargoUrl]()!).json(),
                        {
                            resolvedUrl: cargoOrigin + "/",
                            manifestName: MANIFEST_NAME
                        }
                    ),
                )
                const packageResponse = await client.getCargoIndexByCanonicalUrl(
                    canonicalUrl
                )
                expect(packageResponse).not.toBe(null)
            }
            const response = await client.checkForUpdates({
                canonicalUrl,
                tag: 0
            })
            expect(response.errorOccurred()).toBe(true)
            if (errorType === "network") {
                expect(response.status).toBe(Shabah.STATUS.networkError)
            } else if (errorType === "bad-http") {
                expect(response.status).toBe(Shabah.STATUS.badHttpCode)
            }
            if (perviousCargoExists) {
                expect(response.previousVersionExists()).toBe(true)
            }
        }
    })

    it("if requests cargo request succeeds but cargo is incorrectly encoded, errorOccurred should be true", async () => {
        type TestConfig = {
            cargoOrigin: string
            errorType: "json" | "bad-cargo"
            previousCargo?: () => null | Response
            newCargo: () => null | Response
        }
        const initTestCase = ({
            cargoOrigin,
            errorType,
            newCargo,
            previousCargo
        }: TestConfig) => {
            const networkFiles = newCargo 
                ? {[`${cargoOrigin}/${MANIFEST_NAME}`]: newCargo}
                : {}
            const cacheFiles = previousCargo
                ? {[`${cargoOrigin}/${MANIFEST_NAME}`]: previousCargo}
                : {}
            return {networkFiles, cacheFiles, errorType}
        }
        const cargoOrigin = `https://cargo-house.repo/pkg`
        const invalidJson = "{"
        const invalidCargo = "{}"
        const cases = [
            initTestCase({
                cargoOrigin,
                errorType: "json", 
                newCargo: () => {
                    return new Response(invalidJson, {status: 200})
                }
            }),
            initTestCase({
                cargoOrigin,
                errorType: "bad-cargo", 
                newCargo: () => {
                    return new Response(invalidCargo, {status: 200})
                }
            }),
            initTestCase({
                cargoOrigin,
                errorType: "json", 
                newCargo: () => {
                    return new Response(invalidJson, {status: 200})
                },
                previousCargo: () => {
                    return new Response(JSON.stringify(mockCargo), {
                        status: 200
                    })
                }
            }),
            initTestCase({
                cargoOrigin,
                errorType: "bad-cargo", 
                newCargo: () => {
                    return new Response(invalidCargo, {status: 200})
                },
                previousCargo: () => {
                    return new Response(JSON.stringify(mockCargo), {
                        status: 200
                    })
                }
            }),
        ] as const
        const origin = "https://my-house.org"
        for (const {networkFiles, cacheFiles, errorType} of cases) {
            const {client} = createClient(origin, {
                networkFiles, cacheFiles
            })
            const perviousCargoExists = Object.keys(cacheFiles).length > 0
            const canonicalUrl = cargoOrigin + "/" + MANIFEST_NAME
            if (perviousCargoExists) {
                const cargoUrl = Object.keys(cacheFiles)[0]
                await client.putCargoIndex(
                    cargoToCargoIndex(
                        canonicalUrl,
                        await (cacheFiles[cargoUrl]()!).json(),
                        {
                            resolvedUrl: cargoOrigin + "/",
                            manifestName: MANIFEST_NAME
                        }
                    ),
    
                )
                expect(await client.getCargoIndexByCanonicalUrl(canonicalUrl)).not.toBe(null)
            }
            const response = await client.checkForUpdates({
                canonicalUrl,
                tag: 0
            })
            expect(response.errorOccurred()).toBe(true)
            if (errorType === "bad-cargo") {
                expect(response.status).toBe(Shabah.STATUS.invalidManifestEncoding)
            } else if (errorType === "json") {
                expect(response.status).toBe(Shabah.STATUS.encodingNotAcceptable)
            }
            if (perviousCargoExists) {
                expect(response.previousVersionExists()).toBe(true)
            }
        }
    })

    it("if one of files listed in cargo is unreachable, returns a bad http code, or does not have 'content-length' header, an errorOccurred should be true", async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const testCargo = structuredClone(mockCargo)
        const testFile1 = "index.js"
        const testFile2 = "styles.css"
        testCargo.files.push(
            {name: testFile1, bytes: 0, invalidation: "default"},
            {name: testFile2, bytes: 0, invalidation: "default"},
        )
        const cases = [
            {
                file1: badHttpResponse(404),
                file2: okResponse() 
            },
            {
                file1: networkError(),
                file2: okResponse()
            },
            {
                file1: okResponse(),
                file2: badHttpResponse(404)
            },
            {
                file1: okResponse(),
                file2: networkError()
            },
            {
                file1: networkError(),
                file2: networkError()
            },
            {
                file1: badHttpResponse(500),
                file2: badHttpResponse(404)
            },
        ] as const
        for (const {file1, file2} of cases) {
            const {client} = createClient(origin, {
                networkFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(testCargo),
                            {status: 200}
                        )
                    },
                    [`${cargoOrigin}/${testFile1}`]: file1,
                    [`${cargoOrigin}/${testFile2}`]: file2
                }
            })
            const canonicalUrl = cargoOrigin + "/" + MANIFEST_NAME
            const response = await client.checkForUpdates(
                {canonicalUrl, tag: 0}
            )
            expect(response.errorOccurred()).toBe(true)
            expect(response.status).toBe(Shabah.STATUS.preflightVerificationFailed)
        }
    })

    it("if cargo is fetched correct, errorOccurred should be false", async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const testCargo = structuredClone(mockCargo)
        const testFile = "index.js"
        testCargo.files.push(
            {name: testFile, bytes: 0, invalidation: "default"}
        )
        const {client} = createClient(origin, {
            networkFiles: {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(testCargo),
                        {status: 200}
                    )
                },
                [`${cargoOrigin}/${testFile}`]: () => {
                    return new Response("", {
                        status: 200,
                        headers: {"content-length": "0"}
                    })
                }
            }
        })
        const canonicalUrl = cargoOrigin + "/" + MANIFEST_NAME
        const response = await client.checkForUpdates(
            {canonicalUrl, tag: 0}
        )
        expect(response.errorOccurred()).toBe(false)
        expect(response.newCargo).not.toBe(null)
        expect(await response.originalNewCargoResponse.text()).toStrictEqual(
            JSON.stringify(testCargo)
        )
        expect(response.resolvedUrl).toBe(cargoOrigin + "/")
    })

    it("if cargo is fetched correctly and encounter redirect, errorOccurred should be false and resolved url should be the url that was redirected to", async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const redirectOrigin = "https://redirect.go"
        const {client} = createClient(origin, {
            networkFiles: {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(mockCargo),
                        {status: 200}
                    )
                },
                [`${redirectOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        "",
                        {status: 302, headers: {
                            "location": `${cargoOrigin}/${MANIFEST_NAME}`
                        }}
                    )
                }
            }
        })
        const redirectCanonicalUrl = redirectOrigin + "/" + MANIFEST_NAME
        const response = await client.checkForUpdates(
            {canonicalUrl: redirectCanonicalUrl, tag: 0}
        )
        expect(response.errorOccurred()).toBe(false)
        expect(response.newCargo).not.toBe(null)
        expect(await response.originalNewCargoResponse.text()).toStrictEqual(
            JSON.stringify(mockCargo)
        )
        expect(response.canonicalUrl).toBe(redirectCanonicalUrl)
        expect(response.resolvedUrl).toBe(cargoOrigin + "/")
    })

    it("if cargo is fetched correctly and there is not enough storage space for cargo, enoughStorageForCargo should be false", async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const testCargo = structuredClone(mockCargo)
        const filesize = 10_000
        const testFile = "index.js"
        testCargo.files.push(
            {name: testFile, bytes: 0, invalidation: "default"}
        )
        const currentBytesUsed = 200
        const allowBytes = 500
        expect(currentBytesUsed + filesize).toBeGreaterThan(allowBytes)
        const {client} = createClient(origin, {
            cacheQuota: {usage: currentBytesUsed, quota: allowBytes},
            networkFiles: {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(testCargo),
                        {status: 200}
                    )
                },
                [`${cargoOrigin}/${testFile}`]: () => {
                    return new Response("", {
                        status: 200,
                        headers: {"content-length": filesize.toString()}
                    })
                }
            }
        })
        const canonicalUrl = cargoOrigin + "/" + MANIFEST_NAME
        const response = await client.checkForUpdates(
            {canonicalUrl, tag: 0}
        )
        expect(response.enoughStorageForCargo()).toBe(false)
        expect(response.errorOccurred()).toBe(false)
        expect(response.newCargo).not.toBe(null)
        expect(response.resolvedUrl).toBe(cargoOrigin + "/")
    })

    it(`if cargo was not previously installed, previous cargo should be null and previous cargo version should be "${Shabah.NO_PREVIOUS_INSTALLATION}"`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const testCargo = structuredClone(mockCargo)
        const testFile = "index.js"
        testCargo.files.push(
            {name: testFile, bytes: 0, invalidation: "default"}
        )
        const {client} = createClient(origin, {
            networkFiles: {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(testCargo),
                        {status: 200}
                    )
                },
                [`${cargoOrigin}/${testFile}`]: () => {
                    return new Response("", {
                        status: 200,
                        headers: {"content-length": "0"}
                    })
                }
            }
        })
        const canonicalUrl = cargoOrigin + "/" + MANIFEST_NAME
        const response = await client.checkForUpdates(
            {canonicalUrl, tag: 0}
        )
        expect(response.errorOccurred()).toBe(false)
        expect(response.newCargo).not.toBe(null)
        expect(response.previousCargo).toBe(null)
        expect(response.versions().new).toBe(testCargo.version)
        expect(response.versions().old).toBe(Shabah.NO_PREVIOUS_INSTALLATION)
    })

    it(`if cargo was previously installed, previous cargo should not be null and previous cargo version should be a valid version`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const oldCargo = structuredClone(mockCargo)
        const testFile = "index.js"
        oldCargo.files.push(
            {name: testFile, bytes: 0, invalidation: "default"}
        )
        const newCargo = structuredClone(oldCargo)
        newCargo.version = "2.0.0"
        const {client} = createClient(origin, {
            cacheFiles: {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(oldCargo),
                        {status: 200}
                    )
                },
            },
            networkFiles: {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(newCargo),
                        {status: 200}
                    )
                },
                [`${cargoOrigin}/${testFile}`]: () => {
                    return new Response("", {
                        status: 200,
                        headers: {"content-length": "0"}
                    })
                }
            }
        })
        const canonicalUrl = cargoOrigin + "/" + MANIFEST_NAME
        await client.putCargoIndex(
            cargoToCargoIndex(canonicalUrl, oldCargo, {
                resolvedUrl: cargoOrigin + "/",
                manifestName: MANIFEST_NAME
            }),
        )
        const response = await client.checkForUpdates(
            {canonicalUrl, tag: 0}
        )
        expect(response.errorOccurred()).toBe(false)
        expect(response.newCargo).not.toBe(null)
        expect(response.previousCargo).not.toBe(null)
        expect(response.versions().new).toBe(newCargo.version)
        expect(response.versions().old).toBe(oldCargo.version)
    })

    it(`if fetched cargo is a greater version, update available should be true, other wise should be false`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const cases = [
            {oldV: "1.5.0", newV: "2.0.0", updateAvailable: true},
            {oldV: "2.5.0", newV: "2.5.1", updateAvailable: true},
            {oldV: "1.0.0", newV: "0.1.0", updateAvailable: false},
            {oldV: "5.60.7", newV: "5.7.16", updateAvailable: false},
        ] as const
        for (const {oldV, newV, updateAvailable} of cases) {
            const oldCargo = structuredClone(mockCargo)
            oldCargo.version = oldV
            const testFile = "index.js"
            oldCargo.files.push(
                {name: testFile, bytes: 0, invalidation: "default"}
            )
            const newCargo = structuredClone(oldCargo)
            newCargo.version = newV
            const {client} = createClient(origin, {
                cacheFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(oldCargo),
                            {status: 200}
                        )
                    },
                },
                networkFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(newCargo),
                            {status: 200}
                        )
                    },
                    [`${cargoOrigin}/${testFile}`]: () => {
                        return new Response("", {
                            status: 200,
                            headers: {"content-length": "0"}
                        })
                    }
                }
            })
            const canonicalUrl = cargoOrigin + "/" + MANIFEST_NAME
            await client.putCargoIndex(
                cargoToCargoIndex(canonicalUrl, oldCargo, {
                    resolvedUrl: cargoOrigin + "/",
                    manifestName: MANIFEST_NAME
                }),

            )
            const response = await client.checkForUpdates(
                {canonicalUrl, tag: 0}
            )
            const newVersion = SemVer.fromString(newCargo.version)!
            const oldVersion = SemVer.fromString(oldCargo.version)!
            const newIsGreater = newVersion.isGreater(oldVersion)
            expect(newIsGreater).toBe(updateAvailable)
            expect(response.updateAvailable()).toBe(updateAvailable)
            expect(response.errorOccurred()).toBe(false)
            
            if (newIsGreater) {
                expect(response.newCargo).not.toBe(null)
                expect(response.versions().new).toBe(newCargo.version)
                expect(response.previousCargo).not.toBe(null)
                expect(response.versions().old).toBe(oldCargo.version)
            } else {
                expect(response.newCargo).toBe(null)
                expect(response.versions().new).toBe(Shabah.NO_PREVIOUS_INSTALLATION)
                expect(response.previousCargo).not.toBe(null)
                expect(response.versions().old).toBe(oldV)   
            }
           
        }
    })

    it(`if previous installation does not exist and fetch of cargo is successfull, updateAvailable should always return`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const cases = [
            {newV: "1.0.0"},
            {newV: "2.4.1"},
            {newV: "0.1.0"},
            { newV: "5.7.16"},
        ] as const
        for (const {newV} of cases) {
            const oldCargo = structuredClone(mockCargo)
            const testFile = "index.js"
            const newCargo = structuredClone(mockCargo)
            newCargo.version = newV
            const {client} = createClient(origin, {
                cacheFiles: {
                    
                },
                networkFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(newCargo),
                            {status: 200}
                        )
                    },
                    [`${cargoOrigin}/${testFile}`]: () => {
                        return new Response("", {
                            status: 200,
                            headers: {"content-length": "0"}
                        })
                    }
                }
            })
            const canonicalUrl = cargoOrigin + "/" + MANIFEST_NAME
            await client.putCargoIndex(
                cargoToCargoIndex(canonicalUrl, oldCargo, {
                    resolvedUrl: cargoOrigin + "/"
                }),

            )
            const response = await client.checkForUpdates(
                {canonicalUrl, tag: 0}
            )
            expect(response.updateAvailable()).toBe(true)
            expect(response.errorOccurred()).toBe(false)
        }
    })

    it(`if fetch is successful non-existent permissions should be filtered out`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const cases = [
            ["random-2", "random01"],
            ["x-camera", "x"],
            ["z", "z-location"],
        ] as const
        for (const permissions of cases) {
            const oldCargo = structuredClone(mockCargo)
            const testFile = "index.js"
            const newCargo = structuredClone(mockCargo)
            {(newCargo.permissions as any) = permissions}
            const {client} = createClient(origin, {
                cacheFiles: {
                    
                },
                networkFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(newCargo),
                            {status: 200}
                        )
                    },
                    [`${cargoOrigin}/${testFile}`]: () => {
                        return new Response("", {
                            status: 200,
                            headers: {"content-length": "0"}
                        })
                    }
                }
            })
            const canonicalUrl = cargoOrigin + "/" + MANIFEST_NAME
            await client.putCargoIndex(
                cargoToCargoIndex(canonicalUrl, oldCargo, {
                    resolvedUrl: cargoOrigin + "/"
                }),

            )
            const response = await client.checkForUpdates(
                {canonicalUrl, tag: 0}
            )
            expect(response.updateAvailable()).toBe(true)
            expect(response.newCargo).not.toBe(null)
            expect(response.newCargo?.permissions).toStrictEqual([])
        }
    })

    it(`if fetch is successful valid duplicate permissions should be filtered out`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const cases = [
            ["camera", "camera"],
            ["geoLocation", "geoLocation"],
            ["microphone", "microphone"],
        ] as const
        for (const permissions of cases) {
            const oldCargo = structuredClone(mockCargo)
            const testFile = "index.js"
            const newCargo = structuredClone(mockCargo)
            {(newCargo.permissions as any) = permissions}
            const {client} = createClient(origin, {
                cacheFiles: {
                    
                },
                networkFiles: {
                    [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                        return new Response(
                            JSON.stringify(newCargo),
                            {status: 200}
                        )
                    },
                    [`${cargoOrigin}/${testFile}`]: () => {
                        return new Response("", {
                            status: 200,
                            headers: {"content-length": "0"}
                        })
                    }
                }
            })
            const canonicalUrl = cargoOrigin + "/" + MANIFEST_NAME
            await client.putCargoIndex(
                cargoToCargoIndex(canonicalUrl, oldCargo, {
                    resolvedUrl: cargoOrigin + "/"
                }),
            )
            const response = await client.checkForUpdates(
                {canonicalUrl, tag: 0}
            )
            expect(response.updateAvailable()).toBe(true)
            expect(response.newCargo).not.toBe(null)
            expect(response.newCargo?.permissions.length).toBe(1)
        }
    })

    it(`if previous cargo exists, downloadable resources should be returned as the difference between new and old cargo files`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const cases = [
            {
                oldFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                ], 
                newFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                    {name: "style.css", bytes: 200, invalidation: "default"},
                ],
            },
            {
                oldFiles: [
                    {name: "entry.js", bytes: 100, invalidation: "default"},
                    {name: "yes.html", bytes: 399, invalidation: "default"},
                    {name: "pic.png", bytes: 555, invalidation: "default"},
                ], 
                newFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                    {name: "style.css", bytes: 200, invalidation: "default"},
                ],
            },
            {
                oldFiles: [
                    {name: "entry.js", bytes: 100, invalidation: "default"},
                    {name: "yes.html", bytes: 399, invalidation: "default"},
                    {name: "pic.png", bytes: 555, invalidation: "default"},
                ], 
                newFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                    {name: "entry.js", bytes: 100, invalidation: "default"},
                    {name: "pic.png", bytes: 100, invalidation: "default"},
                    {name: "style.css", bytes: 200, invalidation: "default"},
                    {name: "style1.css", bytes: 200, invalidation: "default"},
                ],
            },
        ]
        for (const {oldFiles, newFiles} of cases) {

            const oldCargo = structuredClone(mockCargo)
            oldCargo.version = "0.1.0"
            oldCargo.files = [...oldFiles] as typeof oldCargo.files
            
            const cacheFileBase = {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(oldCargo),
                        {status: 200}
                    )
                },
            }
            const cacheFiles = oldCargo.files.reduce((total, next) => {
                const {name, bytes} = next
                total[`${cargoOrigin}/${name}`] = okResponse({
                    status: 200,
                    length: bytes
                })
                return total
            }, cacheFileBase)

            const newCargo = structuredClone(oldCargo)
            newCargo.version = "1.0.0"
            newCargo.files = [...newFiles] as typeof newCargo.files
            
            const networkFilesBase = {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(newCargo),
                        {status: 200}
                    )
                }
            }
            const networkFiles = newCargo.files.reduce((total, next) => {
                const {name, bytes} = next
                total[`${cargoOrigin}/${name}`] = okResponse({
                    status: 200,
                    length: bytes
                })
                return total
            }, networkFilesBase)

            const {client} = createClient(origin, {
                cacheFiles,
                networkFiles
            })
            const canonicalUrl = cargoOrigin + "/" + MANIFEST_NAME
            await client.putCargoIndex(
                cargoToCargoIndex(canonicalUrl, oldCargo, {
                    resolvedUrl: cargoOrigin + "/",
                    manifestName: MANIFEST_NAME
                }),
            )
            const response = await client.checkForUpdates(
                {canonicalUrl, tag: 0}
            )
            expect(response.updateAvailable()).toBe(true)
            expect(response.errorOccurred()).toBe(false)
            expect(response.downloadMetadata().downloadableResources.length).toBeGreaterThan(0)

            const oldFileMap = new Map<string, number>()
            for (const {name} of oldFiles) {
                oldFileMap.set(`${cargoOrigin}/${name}`, 1)
            }

            const newFileMap = new Map<string, number>()
            for (const {name} of newFiles) {
                newFileMap.set(`${cargoOrigin}/${name}`, 1)
            }

            const filesToDownload = []
            for (const {name} of newFiles) {
                const url = `${cargoOrigin}/${name}`
                if (!oldFileMap.has(`${cargoOrigin}/${name}`)) {
                    filesToDownload.push(url)
                }
            }

            expect(response.downloadMetadata().downloadableResources.length).toBe(filesToDownload.length)
            for (const url of filesToDownload) {
                const file = response
                    .downloadMetadata()
                    .downloadableResources
                    .find((file) => file.requestUrl === url)
                expect(!!file).toBe(true)
            }

            const filesToDelete = []
            for (const {name} of oldFiles) {
                const url = `${cargoOrigin}/${name}`
                if (!newFileMap.has(url)) {
                    filesToDelete.push(url)
                }
            }
            expect(response.downloadMetadata().resourcesToDelete.length).toBe(filesToDelete.length)
            for (const url of filesToDelete) {
                const file = response
                    .downloadMetadata()
                    .resourcesToDelete
                    .find((file) => file.requestUrl === url)
                expect(!!file).toBe(true)
            }
        }
    })

    it(`downloadable resource url should be prepended with resolved url`, async () => {
        const origin = "https://my-mamas.com"
        const cargoOrigin = "https://my-house.com"
        const redirectOrigin = "https://redirect.go"
        const cases = [
            {
                oldFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                ], 
                newFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                    {name: "style.css", bytes: 200, invalidation: "default"},
                ],
            },
            {
                oldFiles: [
                    {name: "entry.js", bytes: 100, invalidation: "default"},
                    {name: "yes.html", bytes: 399, invalidation: "default"},
                    {name: "pic.png", bytes: 555, invalidation: "default"},
                ], 
                newFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                    {name: "style.css", bytes: 200, invalidation: "default"},
                ],
            },
            {
                oldFiles: [
                    {name: "entry.js", bytes: 100, invalidation: "default"},
                    {name: "yes.html", bytes: 399, invalidation: "default"},
                    {name: "pic.png", bytes: 555, invalidation: "default"},
                ], 
                newFiles: [
                    {name: "index.js", bytes: 100, invalidation: "default"},
                    {name: "entry.js", bytes: 100, invalidation: "default"},
                    {name: "pic.png", bytes: 100, invalidation: "default"},
                    {name: "style.css", bytes: 200, invalidation: "default"},
                    {name: "style1.css", bytes: 200, invalidation: "default"},
                ],
            },
        ]
        for (const {oldFiles, newFiles} of cases) {

            const oldCargo = structuredClone(mockCargo)
            oldCargo.version = "0.1.0"
            oldCargo.files = [...oldFiles] as typeof oldCargo.files
            
            const cacheFileBase = {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(oldCargo),
                        {status: 200}
                    )
                },
            }
            const cacheFiles = oldCargo.files.reduce((total, next) => {
                const {name, bytes} = next
                total[`${cargoOrigin}/${name}`] = okResponse({
                    status: 200,
                    length: bytes
                })
                return total
            }, cacheFileBase)

            const newCargo = structuredClone(oldCargo)
            newCargo.version = "1.0.0"
            newCargo.files = [...newFiles] as typeof newCargo.files
            
            const networkFilesBase = {
                [`${cargoOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        JSON.stringify(newCargo),
                        {status: 200}
                    )
                },
                [`${redirectOrigin}/${MANIFEST_NAME}`]: () => {
                    return new Response(
                        "",
                        {status: 302, headers: {
                            "location": `${cargoOrigin}/${MANIFEST_NAME}`
                        }}
                    )
                }
            }
            const networkFiles = newCargo.files.reduce((total, next) => {
                const {name, bytes} = next
                total[`${cargoOrigin}/${name}`] = okResponse({
                    status: 200,
                    length: bytes
                })
                return total
            }, networkFilesBase)

            const {client} = createClient(origin, {
                cacheFiles,
                networkFiles
            })
            const redirectCanonicalUrl = redirectOrigin + "/" + MANIFEST_NAME
            await client.putCargoIndex(
                cargoToCargoIndex(redirectCanonicalUrl, oldCargo, {
                    resolvedUrl: cargoOrigin + "/",
                    manifestName: MANIFEST_NAME
                }),

            )
            const response = await client.checkForUpdates(
                {canonicalUrl: redirectCanonicalUrl, tag: 0}
            )
            expect(response.updateAvailable()).toBe(true)
            expect(response.errorOccurred()).toBe(false)
            expect(response.resolvedUrl).not.toBe(response.canonicalUrl)
            expect(response.resolvedUrl).toBe(cargoOrigin + "/")
            expect(response.downloadMetadata().downloadableResources.length).toBeGreaterThan(0)

            const oldFileMap = new Map<string, number>()
            for (const {name} of oldFiles) {
                oldFileMap.set(`${cargoOrigin}/${name}`, 1)
            }

            const newFileMap = new Map<string, number>()
            for (const {name} of newFiles) {
                newFileMap.set(`${cargoOrigin}/${name}`, 1)
            }

            const filesToDownload = []
            for (const {name} of newFiles) {
                const url = `${cargoOrigin}/${name}`
                if (!oldFileMap.has(`${cargoOrigin}/${name}`)) {
                    filesToDownload.push(url)
                }
            }
            
            expect(response.downloadMetadata().downloadableResources.length).toBe(filesToDownload.length)
            for (const url of filesToDownload) {
                const file = response
                    .downloadMetadata()
                    .downloadableResources
                    .find((file) => file.requestUrl === url)
                expect(!!file).toBe(true)
            }

            const filesToDelete = []
            for (const {name} of oldFiles) {
                const url = `${cargoOrigin}/${name}`
                if (!newFileMap.has(url)) {
                    filesToDelete.push(url)
                }
            }

            expect(response.downloadMetadata().resourcesToDelete.length).toBe(filesToDelete.length)
            for (const url of filesToDelete) {
                const file = response
                    .downloadMetadata()
                    .resourcesToDelete
                    .find((file) => file.requestUrl === url)
                expect(!!file).toBe(true)
            }
        }
    })
})