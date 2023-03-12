import {io} from "../../lib/monads/result"
import {
	validateManifest, 
	diffManifestFiles, 
	HuzmaManifest,
	MANIFEST_FILE_SUFFIX,
} from "huzma"
import {SemVer} from "small-semver"
import {urlToMime} from "../../lib/miniMime/index"
import {
	FileCache, 
	FetchFunction,
	ResourceMap
} from "./backend"
import {serviceWorkerPolicies,} from "./serviceWorkerMeta"
import {resultJsonParse} from "../../lib/monads/utils/jsonParse"
import {stripRelativePath} from "../utils/urls/stripRelativePath"
import {addSlashToEnd} from "../utils/urls/addSlashToEnd"
import {isUrl} from "../utils/urls/isUrl"
import {stringBytes} from "../utils/stringBytes"
import {getFileNameFromUrl} from "../utils/urls/getFilenameFromUrl"
import {removeZipExtension} from "../utils/urls/removeZipExtension"

export type RequestableResource = {
    requestUrl: string
    storageUrl: string
    bytes: number
}

export const ERROR_CODES_START = 100

export const STATUS_CODES = {
	ok: 0,
	updateQueued: 1,
	updateRetryQueued: 2,
	noDownloadbleResources: 3,
	cached: 4,
	manifestIsUpToDate: 5,
	messagesConsumed: 6,
	noMessagesFound: 7,
	createNewIndex: 8,
	updatedPreviousIndex: 9,
	assetCacheDisallowed: 10,

	networkError: ERROR_CODES_START,
	badHttpCode: 101,
	encodingNotAcceptable: 102,
	invalidManifestEncoding: 103,
	invalidRedirect: 104,
	preflightVerificationFailed: 105,
	updateImpossible: 106,
	updateNotAvailable: 107,
	insufficentDiskSpace: 108,
	updateAlreadyQueued: 109,
	downloadManagerUnsyncedState: 110,
	remoteResourceNotFound: 111,
	foundButContentIsEmpty: 112,
	noSegmentsFound: 113,
	invalidErrorDownloadIndex: 114,
	updateRetryImpossible: 115,
	zeroUpdatesProvided: 116,
	invalidManifestUrl: 117,
	malformedUrl: 118,
	errorIndexNotFound: 119,
	allMessagesAreOrphaned: 120,
	someMessagesAreOrphaned: 121,
	downloadSegmentNotFound: 122,
	liveFetchFailed: 123
} as const

export type StatusCode = typeof STATUS_CODES[keyof typeof STATUS_CODES]

const cargoHeaders = {
	...serviceWorkerPolicies.networkOnly,
	//pragma: "no-cache",
	"cache-control": "no-cache"
} as const

class CargoFetchResponse {
	error: string
	cargo: {pkg: HuzmaManifest, errors: string[] ,semanticVersion: SemVer} | null
	text: string
	response: Response | null
	resolvedUrl: string
	code: StatusCode
	manifestName: string

	constructor({
		error = "",
		cargo = null,
		text = "",
		response = null,
		resolvedUrl = "",
		code = STATUS_CODES.ok,
		manifestName = ""
	}: Partial<CargoFetchResponse>) {
		this.error = error
		this.cargo = cargo
		this.text = text
		this.response = response
		this.resolvedUrl = resolvedUrl
		this.code = code
		this.manifestName = manifestName
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
			code: STATUS_CODES.networkError,
			error: `http request for new cargo encountered a fatal error: ${newCargoFetch.msg}`,
		})
	}
	const newCargoRes = newCargoFetch.data
	if (!newCargoRes.ok) {
		const code = newCargoRes.status === 404
			? STATUS_CODES.remoteResourceNotFound
			: STATUS_CODES.badHttpCode
		return new CargoFetchResponse({
			code,
			error: `error http code when requesting new cargo for segment "${name}": status=${newCargoRes.status}, status_text=${newCargoRes.statusText}."`,
		})
	}
	const newCargoResponseCopy = newCargoRes.clone()
	const newCargoText = await io.wrap(newCargoRes.text())
	if (!newCargoText.ok) {
		return new CargoFetchResponse({
			code: STATUS_CODES.encodingNotAcceptable,
			error: `new cargo for "${name}" found no text. Error: ${newCargoText.msg}`
		})
	}
	const newCargoJson = resultJsonParse(newCargoText.data)
	if (!newCargoJson.ok) {
		return new CargoFetchResponse({
			code: STATUS_CODES.encodingNotAcceptable,
			error: `new cargo for "${name}" was not json encoded. Error: ${newCargoJson.msg}`,
		})
	}
	const newCargoPkg = validateManifest(newCargoJson.data)
	if (newCargoPkg.errors.length > 0) {
		return new CargoFetchResponse({
			code: STATUS_CODES.invalidManifestEncoding,
			error: `new cargo for "${name}" is not a valid manifest. Errors: ${newCargoPkg.errors.join(",")}`,
		})
	}
	const baseUrl = addSlashToEnd(
		newCargoRes.url.split("/").slice(0, -1).join("/")
	)
	if (baseUrl.length < 1) {
		return new CargoFetchResponse({
			code: STATUS_CODES.invalidRedirect,
			error: "HuzmaManifest request redirected to empty url"
		})
	}
	return new CargoFetchResponse({
		code: STATUS_CODES.ok,
		cargo: newCargoPkg, 
		text: newCargoText.data,
		response: newCargoResponseCopy,
		resolvedUrl: baseUrl,
		manifestName: getFileNameFromUrl(newCargoRes.url)
	})
}

type DownloadResponse = {
    downloadableResources: RequestableResource[] 
    errors: string[]
    bytesToDownload: number
    newCargo: {
        response: Response
        text: string
        parsed: HuzmaManifest
        canonicalUrl: string
        resolvedUrl: string
    } | null
    resoucesToDelete: RequestableResource[]
    totalBytes: number
    bytesToDelete: number
    cargoManifestBytes: number
    previousVersionExists: boolean
    previousCargo: null | HuzmaManifest
    code: StatusCode
    manifestName: string
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
	code = STATUS_CODES.ok,
	manifestName = ""
}: Partial<DownloadResponse>): DownloadResponse => ({
	downloadableResources, 
	errors,
	bytesToDownload,
	newCargo,
	resoucesToDelete,
	totalBytes,
	bytesToDelete,
	cargoManifestBytes,
	previousVersionExists,
	previousCargo,
	code,
	manifestName
})

const downloadError = (
	msg: string,
	code: StatusCode,
	previousVersionExists = true,
	previousCargo = null as null | HuzmaManifest
) => {
	return downloadResponse({
		errors: [msg], 
		code, 
		previousVersionExists,
		previousCargo
	})
}

const versionUpToDate = ({
	previousCargo = null as null | HuzmaManifest
} = {}) => downloadResponse({
	code: STATUS_CODES.manifestIsUpToDate,
	previousCargo
})


const NO_ERROR_OCCURRED = ""

type PreflightResponse = {url: string, reason: string}

type PreflightErrorResponse = {
    errorUrls: PreflightResponse[] 
    filesWithBytes: Map<string, number>
}

type FileMeta = {
    url: string,
    bytes: number
}

const verifyAllRequestableFiles = async (
	fileUrls: FileMeta[], 
	fetchFn: FetchFunction
): Promise<PreflightErrorResponse> => {
	const filesWithBytes: Map<string, number> = new Map()
	const preFlightResponses: PreflightResponse[] = await Promise.all(fileUrls.map(async (meta) => {
		const {url} = meta
        
		let latestFailMessage = ""
        
		for (let i = 0; i < 3; i++) {
			if (!isUrl(url)) {
				return {url, reason: "malformed url"}
			}
			const response = await io.wrap(fetchFn(url, {
				method: "HEAD",
				headers: {...serviceWorkerPolicies.networkOnly}
			}))
			if (!response.ok) {
				latestFailMessage = "network error"
				continue
			}
			if (response.data.status === 404) {
				return {url, reason: "resource does not exist"}
			}
			if (!response.data.ok) {
				latestFailMessage = "bad http code"
				continue
			}
            
			const mime = response.data.headers.get("content-type")
			if (mime === null) {
				return {url, reason: "missing 'content-type' header"}
			}

			//if (contentLength === null) {
			//    return {url, reason: "server did not provide 'content-length' header, and fallback length was not provided"}
			//}
			const contentLength = response.data.headers.get("content-length")
            
			const bytes = contentLength === null
				? 0
				: parseInt(contentLength, 10)
            
			if (isNaN(bytes)) {
				return {url, reason: "'content-length' header returned an invalid number (NaN)"} 
			}
			filesWithBytes.set(url, bytes)
			return {url: NO_ERROR_OCCURRED, reason: ""}
		}
		return {url, reason: latestFailMessage}
	}))
	const errorUrls = preFlightResponses.filter(
		(response) => response.url.length > 0
	)
	return {errorUrls, filesWithBytes}
}

type CargoReference = {
    canonicalUrl: string
    oldResolvedUrl: string,
    oldManifestName: string
}

export const checkForUpdates = async (
	{oldResolvedUrl, canonicalUrl, oldManifestName}: CargoReference, 
	fetchFn: FetchFunction,
	fileCache: FileCache
) => {
	if (
		(!canonicalUrl.startsWith("https://") && !canonicalUrl.startsWith("http://"))
        || !isUrl(canonicalUrl)
	) {
		return downloadError(
			`"${canonicalUrl}" is not a valid url`,
			STATUS_CODES.malformedUrl,
			false,
		)
	}
	if (!canonicalUrl.endsWith(MANIFEST_FILE_SUFFIX)) {
		return downloadError(
			`canonical url "${canonicalUrl}" is invalid because it does not have the required suffix "${MANIFEST_FILE_SUFFIX}"`, 
			STATUS_CODES.invalidManifestUrl, 
			false
		)
	}
	const urlSegments = canonicalUrl.split("/")
	if (urlSegments.length < 2) {
		return downloadError(
			`"${canonicalUrl}" is not a full url`,
			STATUS_CODES.malformedUrl,
			false,
		)
	}
    
	const oldResolvedRootUrl = addSlashToEnd(oldResolvedUrl)
	const cargoUrl = oldResolvedRootUrl + oldManifestName

	const storedCargoRes = await fileCache.getFile(cargoUrl)
	const newCargoUrl = canonicalUrl
	if (
		oldResolvedUrl.length < 1
        || !storedCargoRes 
        || storedCargoRes.status === 404
	) {
		const {
			error, 
			cargo: newCargoPkg, 
			text, 
			response,
			resolvedUrl: finalUrl,
			code,
			manifestName
		} = await fetchCargo(
			newCargoUrl, canonicalUrl, fetchFn
		)
		if (!newCargoPkg || !response || error.length > 0) {
			return downloadError(
				error, code, false
			)
		}
		const filesToDownload = newCargoPkg.pkg.files.map((f) => {
			const filename = stripRelativePath(f.name)
			const fileUrl = finalUrl + filename
			return {
				requestUrl: fileUrl,
				storageUrl: removeZipExtension(fileUrl),
				bytes: f.bytes
			} as RequestableResource
		})
		const filePreflightResponses = await verifyAllRequestableFiles(
			filesToDownload.map(
				(file) => ({url: file.requestUrl, bytes: file.bytes})
			),
			fetchFn
		)
		if (filePreflightResponses.errorUrls.length > 0) {
			const preflightErrors = filePreflightResponses
				.errorUrls
				.map((preflightResponse) => `${preflightResponse.url} [${preflightResponse.reason}]`)
				.join(", ")
			return downloadError(
				`the following urls are invalid: ${preflightErrors}`,
				STATUS_CODES.preflightVerificationFailed,
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
		const bytesToDownload = filesToDownload.reduce(
			(total, file) => total + file.bytes, 
			0
		)
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
			previousVersionExists: false,
			code: STATUS_CODES.ok,
			manifestName
		})
	}

	// if cargo has been saved before assume that it's
	// encoded correctly
	const oldCargoPkg = await storedCargoRes.json() as HuzmaManifest
	const oldCargoSemanticVersion = SemVer.fromString(oldCargoPkg.version) as SemVer
	const oldCargo = {
		pkg: oldCargoPkg,
		semanticVersion: oldCargoSemanticVersion
	}

	const {
		error, 
		cargo: newCargoPkg, 
		text, 
		response, 
		resolvedUrl: finalUrl,
		code,
		manifestName
	} = await fetchCargo(
		newCargoUrl, canonicalUrl, fetchFn
	)

	if (!newCargoPkg || !response || error.length > 0) {
		return downloadError(
			error, 
			code,
			true,
			oldCargoPkg,
		)
	}

	if (!newCargoPkg.semanticVersion.isGreater(oldCargo.semanticVersion)) {
		return versionUpToDate({previousCargo: oldCargoPkg})
	}

	const newResolvedUrl = finalUrl
	if (oldResolvedRootUrl !== newResolvedUrl) {
		const filesToDownload = newCargoPkg.pkg.files.map((file) => {
			const fileUrl = finalUrl + stripRelativePath(file.name)
			return {
				requestUrl: fileUrl,
				storageUrl: removeZipExtension(fileUrl),
				bytes: file.bytes
			} as RequestableResource
		})
		const filePreflightResponses = await verifyAllRequestableFiles(
			filesToDownload.map(
				(file) => ({url: file.requestUrl, bytes: file.bytes})
			),
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
			const preflightErrors = filePreflightResponses
				.errorUrls
				.map((preflightResponse) => `${preflightResponse.url} [${preflightResponse.reason}]`)
				.join(", ")
			return downloadError(
				`the following urls are invalid: ${preflightErrors}`,
				STATUS_CODES.preflightVerificationFailed,
				true,
				oldCargoPkg
			)
		}
		const filesToDelete = oldCargoPkg.files.map((file) => {
			const fileUrl = oldResolvedRootUrl + stripRelativePath(file.name)
			return {
				requestUrl: fileUrl,
				storageUrl: removeZipExtension(fileUrl),
				bytes: file.bytes
			} as RequestableResource
		})
		const bytesToDownload = filesToDownload.reduce(
			(total, file) => total + file.bytes, 
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
				resolvedUrl: oldResolvedUrl
			},
			previousCargo: oldCargo.pkg,
			code: STATUS_CODES.ok,
			manifestName
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
			storageUrl: removeZipExtension(fileUrl),
			bytes: file.bytes
		}
	})
	const filePreflightResponses = await verifyAllRequestableFiles(
		filesToDownload.map(
			(file) => ({url: file.requestUrl, bytes: file.bytes})
		),
		fetchFn
	)
	if (filePreflightResponses.errorUrls.length > 0) {
		const preflightErrors = filePreflightResponses
			.errorUrls
			.map((preflightResponse) => `${preflightResponse.url} [${preflightResponse.reason}]`)
			.join(", ")
		return downloadError(
			`the following urls are invalid: ${preflightErrors}`,
			STATUS_CODES.preflightVerificationFailed,
			true,
			oldCargoPkg
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
	const filesToDelete = diff.delete.map((file) => {
		const fileUrl = oldResolvedRootUrl + stripRelativePath(file.name)
		return {
			requestUrl: fileUrl,
			storageUrl: removeZipExtension(fileUrl),
			bytes: file.bytes
		}
	})
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
		previousCargo: oldCargo.pkg,
		code: STATUS_CODES.ok,
		manifestName
	})
}

export const createResourceMap = (
	resources: ReadonlyArray<RequestableResource>
): ResourceMap => {
	const map = {} as ResourceMap
	for (let i = 0; i < resources.length; i++) {
		const {storageUrl, requestUrl, bytes} = resources[i]
		const mime = urlToMime(storageUrl)
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
