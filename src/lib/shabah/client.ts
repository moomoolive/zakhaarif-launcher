import {ResultType, io} from "@/lib/monads/result"
import {MANIFEST_NAME, MANIFEST_MINI_NAME} from "@/lib/cargo/consts"
import {
    validateManifest, 
    validateMiniCargo, 
    ValidatedMiniCargo,
    diffManifestFiles,
    Cargo
} from "@/lib/cargo/index"
import {SemVer} from "@/lib/smallSemver/index"
import {urlToMime} from "@/lib/miniMime/index"
import {
    FileCache, 
    FetchFunction,
    stringBytes,
    serviceWorkerPolicies,
} from "./backend"
import {resultJsonParse} from "@/lib/monads/utils/jsonParse"

type RequestableResource = {
    requestUrl: string
    storageUrl: string
    bytes: number
}

type CargoReference = {
    canonicalUrl: string
    resolvedUrl: string
    name: string
}

const addSlashToEnd = (str: string) => str.endsWith("/") ? str : str + "/"

const stripRelativePath = (url: string) => {
    if (url.startsWith("/")) {
        return url.slice(1)
    } else if (url.startsWith("./")) {
        return url.slice(2)
    } else {
        return url
    }
}

const cargoHeaders = {
    ...serviceWorkerPolicies.networkOnly,
    pragma: "no-cache",
    "cache-control": "no-cache"
} as const

class CargoFetchResponse {
    error: string
    cargo: {pkg: Cargo, errors: string[] ,semanticVersion: SemVer} | null
    text: string
    response: Response | null
    resolvedUrl: string

    constructor({
        error = "",
        cargo = null,
        text = "",
        response = null,
        resolvedUrl = ""
    }: Partial<CargoFetchResponse>) {
        this.error = error
        this.cargo = cargo
        this.text = text
        this.response = response
        this.resolvedUrl = resolvedUrl
    }
}

const fetchCargo = async (
    fullUrl: string,
    name: string,
    fetchFn: FetchFunction
) => {
    const newCargoFetch = await io.retry(
        () => fetchFn(fullUrl, {
            method: "GET",
            headers: cargoHeaders
        }),
        3
    )
    if (!newCargoFetch.ok) {
        return new CargoFetchResponse({
            error: `http request for new cargo encountered a fatal error: ${newCargoFetch.msg}`,
        })
    }
    const newCargoRes = newCargoFetch.data
    if (!newCargoRes.ok) {
        return new CargoFetchResponse({
            error: `error http code when requesting new package for segment "${name}": status=${newCargoRes.status}, status_text=${newCargoRes.statusText}."`,
        })
    }
    const newCargoResponseCopy = newCargoRes.clone()
    const newCargoText = await io.wrap(newCargoRes.text())
    if (!newCargoText.ok) {
        return new CargoFetchResponse({
            error: `new cargo for "${name}" found no text. Error: ${newCargoText.msg}`
        })
    }
    const newCargoJson = resultJsonParse(newCargoText.data)
    if (!newCargoJson.ok) {
        return new CargoFetchResponse({
            error: `new cargo for "${name}" was not json encoded. Error: ${newCargoJson.msg}`,
        })
    }
    const newCargoPkg = validateManifest(newCargoJson.data)
    if (newCargoPkg.errors.length > 0) {
        return new CargoFetchResponse({
            error: `new cargo for "${name}" is not a valid ${MANIFEST_NAME}. Errors: ${newCargoPkg.errors.join(",")}`,
        })
    }
    const [baseUrl] = newCargoRes.url.split(MANIFEST_NAME)
    if (baseUrl.length < 1) {
        return new CargoFetchResponse({error: `Cargo request redirected to empty url`})
    }
    return new CargoFetchResponse({
        cargo: newCargoPkg, 
        text: newCargoText.data,
        response: newCargoResponseCopy,
        resolvedUrl: baseUrl
    })
}

type DownloadResponse = {
    downloadableResources: RequestableResource[] 
    errors: string[]
    bytesToDownload: number
    newCargo: {
        response: Response
        text: string
        parsed: Cargo
        canonicalUrl: string
        resolvedUrl: string
    } | null
    resoucesToDelete: RequestableResource[]
    totalBytes: number
    bytesToDelete: number
    cargoManifestBytes: number
    previousVersionExists: boolean
    previousCargo: null | Cargo
}

const downloadResponse = ({
    downloadableResources = [], 
    errors = [],
    bytesToDownload = 0,
    newCargo = null,
    resoucesToDelete = [],
    totalBytes = 0,
    bytesToDelete = 0,
    cargoManifestBytes = 0,
    previousVersionExists = true,
    previousCargo = null,
}: Partial<DownloadResponse>) => ({
    downloadableResources, 
    errors,
    bytesToDownload,
    newCargo,
    resoucesToDelete,
    totalBytes,
    bytesToDelete,
    cargoManifestBytes,
    previousVersionExists,
    previousCargo
})

const downloadError = (
    msg: string, 
    previousVersionExists = true
) => {
    return downloadResponse({errors: [msg], previousVersionExists})
}

const versionUpToDate = () => downloadResponse({})

const verifyAllRequestableFiles = async (
    fileUrls: string[], 
    fetchFn: FetchFunction
) => {
    const filesWithBytes: Map<string, number> = new Map()
    const preFlightResponses = await Promise.all(fileUrls.map(async (url) => {
        for (let i = 0; i < 3; i++) {
            const response = await io.wrap(fetchFn(url, {method: "HEAD"}))
            if (!response.ok) {
                continue
            }
            if (response.data.status === 404) {
                return url
            }
            if (!response.data.ok) {
                continue
            }
            const contentLength = response.data.headers.get("content-length")
            const mime = response.data.headers.get("content-type")
            if (contentLength === null || mime === null) {
                return url
            }
            const bytes = parseInt(contentLength, 10)
            if (isNaN(bytes)) {
                return url 
            }
            filesWithBytes.set(url, bytes)
            return ""
        }
        return url
    }))
    const errorUrls = preFlightResponses.filter((url) => url.length > 0)
    return {errorUrls, filesWithBytes}
}

export const checkForUpdates = async (
    {resolvedUrl, canonicalUrl, name}: CargoReference, 
    fetchFn: FetchFunction,
    fileCache: FileCache
) => {
    const oldResolvedUrl = addSlashToEnd(resolvedUrl)
    const storageFileBase = addSlashToEnd(resolvedUrl)
    const requestFileBase = addSlashToEnd(canonicalUrl)
    const cargoUrl = storageFileBase + MANIFEST_NAME

    const storedCargoRes = await fileCache.getFile(cargoUrl)
    const newCargoUrl = requestFileBase + MANIFEST_NAME
    if (
        resolvedUrl.length < 0 
        || !storedCargoRes 
        || storedCargoRes.status === 404
    ) {
        const {
            error, 
            cargo: newCargoPkg, 
            text, 
            response,
            resolvedUrl: finalUrl
        } = await fetchCargo(
            newCargoUrl, name, fetchFn
        )
        if (!newCargoPkg || !response || error.length > 0) {
            return downloadError(error, false)
        }
        const filesToDownload = newCargoPkg.pkg.files.map((f) => {
            const filename = stripRelativePath(f.name)
            const fileUrl = finalUrl + filename
            return {
                requestUrl: fileUrl,
                storageUrl: fileUrl,
                bytes: f.bytes
            } as RequestableResource
        })
        const filePreflightResponses = await verifyAllRequestableFiles(
            filesToDownload.map((file) => file.requestUrl),
            fetchFn
        )
        if (filePreflightResponses.errorUrls.length > 0) {
            return downloadError(
                `the following urls are invalid: ${filePreflightResponses.errorUrls.join(",")}`,
                false
            )
        }
        newCargoPkg.pkg.files.forEach((file) => {
            const target = finalUrl + file.name
            const bytes = (
                filePreflightResponses.filesWithBytes.get(target) 
                || 0
            )
            file.bytes = bytes
        })
        filesToDownload.forEach((file) => {
            const bytes = (
                filePreflightResponses.filesWithBytes.get(file.requestUrl) 
                || 0
            )
            file.bytes = bytes
        })
        const bytesToDownload = filesToDownload.reduce((total, file) => {
            return total + file.bytes
        }, 0)
        return downloadResponse({
            bytesToDownload,
            downloadableResources: filesToDownload,
            newCargo: {
                response,
                text, 
                parsed: newCargoPkg.pkg,
                canonicalUrl,
                resolvedUrl: finalUrl
            },
            totalBytes: bytesToDownload,
            cargoManifestBytes: stringBytes(text),
            previousVersionExists: false
        })
    }

    // if cargo has been saved before assume that it's
    // encoded correctly
    const oldCargoPkg = await storedCargoRes.json() as Cargo
    const oldCargoSemanticVersion = SemVer.fromString(oldCargoPkg.version)!
    const oldCargo = {
        pkg: oldCargoPkg,
        semanticVersion: oldCargoSemanticVersion
    }
    //const oldCargo = validateManifest(await storedCargoRes.json())

    const newMiniCargoUrl = requestFileBase + MANIFEST_MINI_NAME
    const newMiniCargoRes = await io.retry(
        () => fetchFn(newMiniCargoUrl, {
            method: "GET",
            headers: cargoHeaders
        }),
        3
    )
    let newMiniCargoJson: ResultType<any>
    let newMiniCargoPkg: ValidatedMiniCargo
    if (
        newMiniCargoRes.ok
        && newMiniCargoRes.data.ok
        && (newMiniCargoJson = await io.wrap(newMiniCargoRes.data.json())).ok
        && (newMiniCargoPkg = validateMiniCargo(newMiniCargoJson.data)).errors.length < 1
        && !newMiniCargoPkg.semanticVersion.isGreater(oldCargo.semanticVersion)
    ) {
        return versionUpToDate()
    }

    const {
        error, 
        cargo: newCargoPkg, 
        text, 
        response, 
        resolvedUrl: finalUrl 
    } = await fetchCargo(
        newCargoUrl, name, fetchFn
    )

    if (!newCargoPkg || !response || error.length > 0) {
        return downloadError(error)
    }

    if (!newCargoPkg.semanticVersion.isGreater(oldCargo.semanticVersion)) {
        return versionUpToDate()
    }


    const newResolvedUrl = finalUrl
    if (oldResolvedUrl !== newResolvedUrl) {
        const filesToDownload = newCargoPkg.pkg.files.map((file) => {
            const fileUrl = finalUrl + stripRelativePath(file.name)
            return {
                requestUrl: fileUrl,
                storageUrl: fileUrl,
                bytes: file.bytes
            } as RequestableResource
        })
        const filePreflightResponses = await verifyAllRequestableFiles(
            filesToDownload.map((file) => file.requestUrl),
            fetchFn
        )
        filesToDownload.forEach((file) => {
            const bytes = (
                filePreflightResponses.filesWithBytes.get(file.requestUrl)
                || 0
            )
            file.bytes = bytes
        })
        newCargoPkg.pkg.files.forEach((file) => {
            const target = finalUrl + stripRelativePath(file.name)
            const bytes = (
                filePreflightResponses.filesWithBytes.get(target)
                || 0
            )
            file.bytes = bytes
        })
        if (filePreflightResponses.errorUrls.length > 0) {
            return downloadError(
                `the following urls are invalid: ${filePreflightResponses.errorUrls.join(",")}`,
                false
            )
        }
        const filesToDelete = oldCargoPkg.files.map((file) => {
            const fileUrl = oldResolvedUrl + stripRelativePath(file.name)
            return {
                requestUrl: fileUrl,
                storageUrl: fileUrl,
                bytes: file.bytes
            } as RequestableResource
        })
        const bytesToDownload = filesToDownload.reduce(
            (total, f) => total + f.bytes, 
            0
        )
        return downloadResponse({
            downloadableResources: filesToDownload,
            bytesToDownload,
            bytesToDelete: filesToDelete.reduce(
                (total, f) => total + f.bytes,
                0
            ),
            cargoManifestBytes: stringBytes(text),
            totalBytes: bytesToDownload,
            resoucesToDelete: filesToDelete,
            newCargo: {
                response,
                text,
                parsed: newCargoPkg.pkg,
                canonicalUrl,
                resolvedUrl
            },
            previousCargo: oldCargo.pkg
        })
    }

    const diff = diffManifestFiles(
        newCargoPkg.pkg,
        oldCargo.pkg,
        "url-diff"    
    )
    const filesToDownload = diff.add.map((file) => {
        const fileUrl = finalUrl + stripRelativePath(file.name)
        return {
            requestUrl: fileUrl,
            storageUrl: fileUrl,
            bytes: file.bytes
        }
    })
    const filePreflightResponses = await verifyAllRequestableFiles(
        filesToDownload.map((file) => file.requestUrl),
        fetchFn
    )
    if (filePreflightResponses.errorUrls.length > 0) {
        return downloadError(
            `the following urls are invalid: ${filePreflightResponses.errorUrls.join(",")}`,
            false
        )
    }
    
    oldCargo.pkg.files.forEach((file) => {
        // get old file sizes, put them into sizes map
        filePreflightResponses.filesWithBytes.set(
            finalUrl + file.name, file.bytes
        )
    })
    newCargoPkg.pkg.files.forEach((file) => {
        const target = finalUrl + file.name
        const bytes = filePreflightResponses.filesWithBytes.get(target) || 0
        file.bytes = bytes
    })
    filesToDownload.forEach((file) => {
        const bytes = (
            filePreflightResponses.filesWithBytes.get(file.requestUrl)
            || 0
        )
        file.bytes = bytes
    })
    const bytesToDownload = filesToDownload.reduce((total, f) => {
        return total + f.bytes
    }, 0)
    const totalBytesOfCargo = newCargoPkg.pkg.files.reduce(
        (total, f) => total + f.bytes,
        0
    )
    const filesToDelete = diff.delete.map((file) => ({
        requestUrl: requestFileBase + stripRelativePath(file.name),
        storageUrl: storageFileBase + stripRelativePath(file.name),
        bytes: file.bytes
    }))
    const bytesToDelete = filesToDelete.reduce(
        (total, f) => total + f.bytes,
        0
    )
    return downloadResponse({
        downloadableResources: filesToDownload,
        bytesToDownload,
        bytesToDelete,
        cargoManifestBytes: stringBytes(text),
        totalBytes: totalBytesOfCargo,
        resoucesToDelete: filesToDelete,
        newCargo: {
            response, 
            text,
            parsed: newCargoPkg.pkg,
            canonicalUrl,
            resolvedUrl: finalUrl,
        },
        previousCargo: oldCargo.pkg
    })
}

import {ResourceMap} from "./backend"

export const createResourceMap = (resources: RequestableResource[]) => {
    const map = {} as ResourceMap
    for (let i = 0; i < resources.length; i++) {
        const {storageUrl, requestUrl, bytes} = resources[i]
        const mime = urlToMime(requestUrl)
        map[requestUrl] = {
            storageUrl,
            bytes,
            mime: mime === "" ? "text/plain" : mime,
            status: 0,
            statusText: ""
        }
    }
    return map
}
