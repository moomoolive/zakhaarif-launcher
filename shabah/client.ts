import type {Mime} from "../miniMime/index"
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

const VIRTUAL_DRIVE_NAME = ".vdrive"
const virtualDriveUrl = (origin: string) => origin + "/" + VIRTUAL_DRIVE_NAME

export const stringBytes = (str: string) => (new TextEncoder().encode(str)).length

const headers = (contentType: Mime, bytes: number) => {
    return {
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Opener-Policy": "same-origin",
        "X-Cache": "SW HIT",
        "Last-Modified": new Date().toUTCString(),
        "Content-Type": contentType,
        "Content-Length": bytes.toString()
    } as const
}

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

export type FetchFunction = (
    input: RequestInfo | URL, 
    init: RequestInit & {retryCount?: number}
) => Promise<ResultType<Response>>

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
    newCargos: Array<{
        storageUrl: string 
        text: string
        parsed: CodeManifestSafe
    }>
    resoucesToDelete: RequestableResource[]
    totalBytes: number
    bytesToDelete: number
    cargoManifestBytes: number
    previousVersionExists: boolean
}

const downloadResponse = ({
    downloadableResources = [], 
    errors = [],
    bytesToDownload = 0,
    newCargos = [],
    resoucesToDelete = [],
    totalBytes = 0,
    bytesToDelete = 0,
    cargoManifestBytes = 0,
    previousVersionExists = true,
}: Partial<DownloadResponse>) => ({
    downloadableResources, 
    errors,
    bytesToDownload,
    newCargos,
    resoucesToDelete,
    totalBytes,
    bytesToDelete,
    cargoManifestBytes,
    previousVersionExists
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
    getCacheFile: FetchFunction
) => {
    const storageFileBase = addSlashToEnd(storageRootUrl)
    const requestFileBase = addSlashToEnd(requestRootUrl)
    const cargoUrl = storageFileBase + MANIFEST_NAME
    const storedCargoRes = await getCacheFile(cargoUrl, {
        method: "GET",
        retryCount: 1
    })

    if (
        !storedCargoRes.ok
        || !storedCargoRes.data.ok && storedCargoRes.data.status !== 404
    ) {
        return errDownloadResponse(
            `error when requesting segment "${name}": ${storedCargoRes.msg}`,
            false
        )
    }

    if (storedCargoRes.data.status === 404) {
        const newCargoRes = await fetchFn(
            requestFileBase + MANIFEST_NAME, {
            method: "GET",
            retryCount: 3
        })
        if (!newCargoRes.ok) {
            return errDownloadResponse(
                `error when requesting new package for segment "${name}": ${newCargoRes.msg}`,
                false
            )
        } else if (!newCargoRes.data.ok) {
            return errDownloadResponse(
                `error http code when requesting new package for segment "${name}": status=${newCargoRes.data.status}, status_text=${newCargoRes.data.statusText}."`,
                false
            )
        }
        const newCargoText = await io.wrap(newCargoRes.data.text())
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
            newCargos: [
                {storageUrl: cargoUrl, text: newCargoText.data, parsed: newCargoPkg.pkg}
            ],
            totalBytes: bytesToDownload,
            cargoManifestBytes: stringBytes(newCargoText.data),
            previousVersionExists: false
        })
    }

    // if cargo has been saved before assume that it's
    // encoded correctly
    const storedCargoJson = await storedCargoRes.data.json()
    const oldCargo = validateManifest(storedCargoJson)

    const newMiniCargoUrl = requestFileBase + MANIFEST_MINI_NAME
    let newMiniCargoRes: ResultType<Response>
    let newMiniCargoJson: ResultType<any>
    let newMiniCargoPkg: ValidatedMiniCargo
    if (
        (newMiniCargoRes = await fetchFn(newMiniCargoUrl, {method: "GET", retryCount: 3})).ok
        && newMiniCargoRes.data.ok
        && (newMiniCargoJson = await io.wrap(newMiniCargoRes.data.json())).ok
        && (newMiniCargoPkg = validateMiniCargo(newMiniCargoJson.data)).errors.length < 1
        && !oldCargo.semanticVersion.isLower(newMiniCargoPkg.semanticVersion)
    ) {
        return updateToDateDownloadResponse()
    }

    const newCargoRes = await fetchFn(
        requestFileBase + MANIFEST_NAME, {
            retryCount: 3,
            method: "GET"        
        }
    )
    if (!newCargoRes.ok) {
        return errDownloadResponse(
            `network error, could not fetch new cargo: ${newCargoRes}`
        )
    } else if (!newCargoRes.data.ok) {
        return errDownloadResponse(
            `http error, could not fetch new cargo: status=${newCargoRes.data.status}, status_text=${newCargoRes.data.statusText}`
        )
    }
    const newCargoText = await io.wrap(newCargoRes.data.text())
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
        newCargos: [
            {storageUrl: cargoUrl, text: newCargoText.data, parsed: newCargoPkg.pkg}
        ]
    })
}

type ResourceMap = Record<string, {
    bytes: number,
    mime: Mime,
    storageUrl: string
}>

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
