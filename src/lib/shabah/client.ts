import {ResultType, io} from "@/lib/monads/result"
import {MANIFEST_NAME, MANIFEST_MINI_NAME} from "@/lib/cargo/consts"
import {
    validateManifest, 
    validateMiniCargo, 
    ValidatedMiniCargo,
    diffManifestFiles,
    CodeManifestSafe
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
    requestRootUrl: string
    storageRootUrl: string
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

type DownloadResponse = {
    downloadableResources: RequestableResource[] 
    errors: string[]
    bytesToDownload: number
    newCargo: {
        storageUrl: string
        requestUrl: string
        response: Response
        text: string
        parsed: CodeManifestSafe
    } | null
    resoucesToDelete: RequestableResource[]
    totalBytes: number
    bytesToDelete: number
    cargoManifestBytes: number
    previousVersionExists: boolean
    previousCargo: null | CodeManifestSafe
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

const cargoHeaders = {
    ...serviceWorkerPolicies.networkOnly,
    pragma: "no-cache",
    "cache-control": "no-cache"
} as const

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
        return {
            error: `http request for new cargo encountered a fatal error: ${newCargoFetch.msg}`,
            cargo: null,
            text: "",
            response: null
        }
    }
    const newCargoRes = newCargoFetch.data
    if (!newCargoRes.ok) {
        return {
            error: `error http code when requesting new package for segment "${name}": status=${newCargoRes.status}, status_text=${newCargoRes.statusText}."`,
            cargo: null,
            text: "",
            response: null
        }
    }
    const newCargoResponseCopy = newCargoRes.clone()
    const newCargoText = await io.wrap(newCargoRes.text())
    if (!newCargoText.ok) {
        return {
            error: `new cargo for "${name}" found no text. Error: ${newCargoText.msg}`,
            cargo: null,
            text: "",
            response: null
        }
    }
    const newCargoJson = resultJsonParse(newCargoText.data)
    if (!newCargoJson.ok) {
        return {
            error: `new cargo for "${name}" was not json encoded. Error: ${newCargoJson.msg}`,
            cargo: null,
            text: "",
            response: null
        }
    }
    const newCargoPkg = validateManifest(newCargoJson.data)
    if (newCargoPkg.errors.length > 0) {
        return {
            error: `new cargo for "${name}" is not a valid ${MANIFEST_NAME}. Errors: ${newCargoPkg.errors.join(",")}`,
            cargo: null,
            text: "",
            response: null
        }
    }
    return {
        error: "", 
        cargo: newCargoPkg, 
        text: newCargoText.data,
        response: newCargoResponseCopy
    }
}

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
    {storageRootUrl, requestRootUrl, name}: CargoReference, 
    fetchFn: FetchFunction,
    fileCache: FileCache
) => {
    const storageFileBase = addSlashToEnd(storageRootUrl)
    const requestFileBase = addSlashToEnd(requestRootUrl)
    const cargoUrl = storageFileBase + MANIFEST_NAME
    const storedCargoRes = await fileCache.getFile(cargoUrl)

    const found = !!storedCargoRes
    if (
        found 
        && !storedCargoRes.ok 
        && storedCargoRes.status !== 404
    ) {
        return downloadError(
            `previous cargo for "${name}" returned with a non-404 error http code`,
            false
        )
    }

    const notFound = !storedCargoRes
    const newCargoUrl = requestFileBase + MANIFEST_NAME
    if (notFound || storedCargoRes.status === 404) {
        const {error, cargo: newCargoPkg, text, response} = await fetchCargo(
            newCargoUrl, name, fetchFn
        )
        if (!newCargoPkg || !response || error.length > 0) {
            return downloadError(error, false)
        }
        const filesToDownload = newCargoPkg.pkg.files.map((f) => {
            const filename = stripRelativePath(f.name)
            return {
                requestUrl: requestFileBase + filename,
                storageUrl: storageFileBase + filename,
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
            const target = requestFileBase + file.name
            const bytes = filePreflightResponses.filesWithBytes.get(target) || 0
            file.bytes = bytes
        })
        filesToDownload.forEach((file) => {
            const bytes = filePreflightResponses.filesWithBytes.get(file.requestUrl) || 0
            file.bytes = bytes
        })
        const bytesToDownload = filesToDownload.reduce((total, file) => {
            return total + file.bytes
        }, 0)
        return downloadResponse({
            bytesToDownload,
            downloadableResources: filesToDownload,
            newCargo: {
                storageUrl: cargoUrl,
                response,
                text, 
                parsed: newCargoPkg.pkg,
                requestUrl: newCargoUrl
            },
            totalBytes: bytesToDownload,
            cargoManifestBytes: stringBytes(text),
            previousVersionExists: false
        })
    }

    // if cargo has been saved before assume that it's
    // encoded correctly
    const oldCargoPkg = await storedCargoRes.json() as CodeManifestSafe
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

    const {error, cargo: newCargoPkg, text, response} = await fetchCargo(
        newCargoUrl, name, fetchFn
    )

    if (!newCargoPkg || !response || error.length > 0) {
        return downloadError(error)
    }

    if (newCargoPkg.pkg.uuid !== oldCargo.pkg.uuid) {
        return downloadError(
            `new cargo has different uuid than old: old=${oldCargo.pkg.uuid}, new=${newCargoPkg.pkg.uuid}`
        )
    }

    if (!newCargoPkg.semanticVersion.isGreater(oldCargo.semanticVersion)) {
        return versionUpToDate()
    }

    const diff = diffManifestFiles(
        newCargoPkg.pkg,
        oldCargo.pkg,
        "url-diff"    
    )
    const filesToDownload = diff.add.map((file) => ({
        requestUrl: requestFileBase + stripRelativePath(file.name),
        storageUrl: storageFileBase + stripRelativePath(file.name),
        bytes: file.bytes
    }))
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
            requestFileBase + file.name, file.bytes
        )
    })
    newCargoPkg.pkg.files.forEach((file) => {
        const target = requestFileBase + file.name
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
            storageUrl: cargoUrl,
            response, 
            text: text,
            parsed: newCargoPkg.pkg,
            requestUrl: newCargoUrl
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
