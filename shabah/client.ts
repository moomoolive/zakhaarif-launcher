import {ResultType, io, Result} from "../monads/result"
import {MANIFEST_NAME, MANIFEST_MINI_NAME} from "../cargo/consts"
import {
    validateManifest, 
    validateMiniCargo, 
    ValidatedMiniCargo,
    diffManifestFiles,
    CodeManifestSafe
} from "../cargo/index"
import {urlToMime} from "../miniMime/index"
import {
    FileCache, 
    FetchFunction,
    stringBytes
} from "./shared"


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

const errDownloadResponse = (
    msg: string, 
    previousVersionExists = true
) => {
    return downloadResponse({errors: [msg], previousVersionExists})
}

const updateToDateDownloadResponse = () => downloadResponse({})

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
        return errDownloadResponse(
            `previous cargo for "${name}" returned with a non-404 error http code`,
            false
        )
    }

    const notFound = !storedCargoRes
    if (notFound || storedCargoRes.status === 404) {
        const newCargoFetch = await io.wrap(fetchFn(
            requestFileBase + MANIFEST_NAME, {
            method: "GET",
            retryCount: 3
        }))
        if (!newCargoFetch.ok) {
            return errDownloadResponse(
                `http request for new cargo encountered a fatal error: ${newCargoFetch.msg}`,
                false
            )
        }
        const newCargoRes = newCargoFetch.data
        if (!newCargoRes.ok) {
            return errDownloadResponse(
                `error http code when requesting new package for segment "${name}": status=${newCargoRes.status}, status_text=${newCargoRes.statusText}."`,
                false
            )
        }
        const newCargoText = await io.wrap(newCargoRes.text())
        if (!newCargoText.ok) {
            return errDownloadResponse(
                    `new cargo for "${name}" found no text. Error: ${newCargoText.msg}`,
                    false
                )
        }
        const newCargoJson = Result.wrap(
            () => JSON.parse(newCargoText.data)
        )
        if (!newCargoJson.ok) {
            return errDownloadResponse(
                    `new cargo for "${name}" was not json encoded. Error: ${newCargoJson.msg}`,
                    false
                )
        }
        const newCargoPkg = validateManifest(newCargoJson.data)
        if (newCargoPkg.errors.length > 0) {
            return errDownloadResponse(
                `new cargo for "${name}" is not a valid ${MANIFEST_NAME}. Errors: ${newCargoPkg.errors.join(",")}`,
                false
            )
        }
        const filesToDownload = newCargoPkg.pkg.files.map((f) => {
            const filename = stripRelativePath(f.name)
            return {
                requestUrl: requestFileBase + filename,
                storageUrl: storageFileBase + filename,
                bytes: f.bytes
            } as RequestableResource
        })
        const bytesToDownload = filesToDownload.reduce((total, file) => {
            return total + file.bytes
        }, 0)
        return downloadResponse({
            bytesToDownload,
            downloadableResources: filesToDownload,
            newCargo: {
                storageUrl: cargoUrl, 
                text: newCargoText.data, 
                parsed: newCargoPkg.pkg
            },
            totalBytes: bytesToDownload,
            cargoManifestBytes: stringBytes(newCargoText.data),
            previousVersionExists: false
        })
    }

    // if cargo has been saved before assume that it's
    // encoded correctly
    const storedCargoJson = await storedCargoRes.json()
    const oldCargo = validateManifest(storedCargoJson)

    const newMiniCargoUrl = requestFileBase + MANIFEST_MINI_NAME
    let newMiniCargoRes: ResultType<Response>
    let newMiniCargoJson: ResultType<any>
    let newMiniCargoPkg: ValidatedMiniCargo
    if (
        (newMiniCargoRes = await io.wrap(fetchFn(newMiniCargoUrl, {method: "GET", retryCount: 3}))).ok
        && newMiniCargoRes.data.ok
        && (newMiniCargoJson = await io.wrap(newMiniCargoRes.data.json())).ok
        && (newMiniCargoPkg = validateMiniCargo(newMiniCargoJson.data)).errors.length < 1
        && !oldCargo.semanticVersion.isLower(newMiniCargoPkg.semanticVersion)
    ) {
        return updateToDateDownloadResponse()
    }

    const newCargoFetch = await io.wrap(fetchFn(
        requestFileBase + MANIFEST_NAME, {
            retryCount: 3,
            method: "GET"        
        }
    ))
    if (!newCargoFetch.ok) {
        return errDownloadResponse(
            `http request for new cargo encountered a fatal error: ${newCargoFetch.msg}`,
            false
        )
    }
    const newCargoRes = newCargoFetch.data
    if (!newCargoRes.ok) {
        return errDownloadResponse(
            `http error, could not fetch new cargo: status=${newCargoRes.status}, status_text=${newCargoRes.statusText}`
        )
    }
    const newCargoText = await io.wrap(newCargoRes.text())
    if (!newCargoText.ok) {
        return errDownloadResponse(
            `new cargo request returned no body: ${newCargoText.msg}`
        )
    }

    const newCargoJson = Result.wrap(
        () => JSON.parse(newCargoText.data)
    )
    if (!newCargoJson.ok) {
        return errDownloadResponse(
            `new cargo is not json encoded: ${newCargoJson.msg}`
        )
    }
    const newCargoPkg = validateManifest(newCargoJson.data)
    if (newCargoPkg.errors.length > 0) {
        return errDownloadResponse(
            `new cargo is not a valid cargo.json: ${newCargoPkg.errors.join(",")}`
        )
    }

    if (newCargoPkg.pkg.uuid !== oldCargo.pkg.uuid) {
        return errDownloadResponse(
            `new cargo has different uuid than old: old=${oldCargo.pkg.uuid}, new=${newCargoPkg.pkg.uuid}`
        )
    }

    if (!oldCargo.semanticVersion.isLower(newCargoPkg.semanticVersion)) {
        return updateToDateDownloadResponse()
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
        cargoManifestBytes: stringBytes(newCargoText.data),
        totalBytes: totalBytesOfCargo,
        resoucesToDelete: filesToDelete,
        newCargo: {
            storageUrl: cargoUrl, 
            text: newCargoText.data, 
            parsed: newCargoPkg.pkg
        },
        previousCargo: oldCargo.pkg
    })
}

import {ResourceMap} from "./shared"

export const createResourceMap = (resources: RequestableResource[]) => {
    const map = {} as ResourceMap
    for (let i = 0; i < resources.length; i++) {
        const {storageUrl, requestUrl, bytes} = resources[i]
        map[requestUrl] = {
            storageUrl,
            bytes,
            mime: urlToMime(requestUrl) || "text/plain"
        }
    }
    return map
}
