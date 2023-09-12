import {ProgressUpdateRecord} from "../lib/shabah/serviceWorker/backgroundFetchHandler"
import {
	MILLISECONDS_PER_MINUTE,
	MILLISECONDS_PER_HOUR,
	MILLISECONDS_PER_YEAR,
	MILLISECONDS_PER_DAY,
	MILLISECONDS_PER_SECOND,
	BYTES_PER_MB, 
	BYTES_PER_GB, 
	BYTES_PER_KB
} from "./consts"
import {roundDecimal} from "./math/rounding"

export type DownloadProgressListener = (progress: ProgressUpdateRecord) => unknown

type AppRpcState = {
    getProgressListeners: () => ReadonlyArray<DownloadProgressListener>
}

export function createAppRpcs(state: AppRpcState) {
	return {
		notifyDownloadProgress: (progress: ProgressUpdateRecord) => {
			const {getProgressListeners} = state
			const list = getProgressListeners()
			for (const listener of list) {
				listener(progress)
			}
			return true
		}
	} as const
}

export type AppRpcs = ReturnType<typeof createAppRpcs>

export type BetterTypeofTypes = (
    "string" | "number" | "bigint" 
    | "boolean" | "symbol" | "undefined" 
    | "function" | "object" | "null" | "array"
)

export function betterTypeof(val: unknown): BetterTypeofTypes {
	const t = typeof val
	if (t !== "object") {
		return t
	} else if (val === null) {
		return "null"
	} else if (Array.isArray(val)) {
		return "array"
	} else {
		return "object"
	}
}

export function sleep(milliseconds: number): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		setTimeout(() => resolve(true), milliseconds)
	})
}

export function stringBytes(str: string): number {
	return (new TextEncoder().encode(str)).length
}

export function reactiveDate(date: Date): string {
	const now = Date.now()
	const compareDate = new Date(date)
	const then = compareDate.getTime()
	const diff = now - then
	if (diff < MILLISECONDS_PER_SECOND * 10) {
		return "just now"
	} else if (diff < MILLISECONDS_PER_MINUTE) {
		return "< 1 min"
	} else if (diff < MILLISECONDS_PER_HOUR) {
		return `${Math.round(diff / MILLISECONDS_PER_MINUTE)} mins ago`
	} else if (diff < MILLISECONDS_PER_DAY) {
		return compareDate.toLocaleString("en-us", {
			minute: "numeric",
			hour: "numeric",
			hourCycle: "h12"
		})
	} else if (diff < MILLISECONDS_PER_YEAR) {
		return compareDate.toLocaleString("en-us", {
			day: "numeric",
			month: "short"
		})
	} else {
		return compareDate.toLocaleString("en-us", {
			day: "numeric",
			month: "short",
			year: "numeric"
		})
	}
}

function getBytesMetric(bytes: number): { factor: number, metric: string } {
	if (bytes > BYTES_PER_GB) {
		return {factor: BYTES_PER_GB, metric: "gb"}
	} else if (bytes > BYTES_PER_MB) {
		return {factor: BYTES_PER_MB, metric: "mb"}
	} else {
		return {factor: BYTES_PER_KB, metric: "kb"}
	}
}

type ByteMetric = {
    count: number
    metric: string
}

export function readableByteCount(bytes: number): ByteMetric {
	const {factor, metric} = getBytesMetric(bytes)
	const normalizedToMetric = roundDecimal(bytes / factor, 2)
	const metricCount = Math.max(0.01, normalizedToMetric)
	return {count: metricCount, metric}
}

export function toGigabytesString(
	bytes: number, 
	decimals: number
): string {
	const normalizedToMetric = roundDecimal(
		bytes / BYTES_PER_GB, 
		decimals
	)
	const smallestPossibleNumber = 1 / 10 ** decimals
	const count = Math.max(
		smallestPossibleNumber, normalizedToMetric
	)
	return `${count} GB`
}

export type CargoRequestError = (
    | "insufficent-storage"
    | "invalid-encoding"
    | "invalid-resource-detected"
    | "network-error"
    | "catch-all-error"
    | "not-found"
    | "malformed-url"
    | "invalid-manifest-url"
    | "analyzing"
    | "manifest-already-exists"
    | "none"
)

export function cargoErrorToText(error: CargoRequestError) {
	switch (error) {
	case "manifest-already-exists":
		return "Add-on already exists"
	case "invalid-manifest-url":
		return "Invalid Add-on url"
	case "insufficent-storage":
		return "Insufficent disk space"
	case "invalid-encoding":
		return "Add-on is encoded incorrectly"
	case "invalid-resource-detected":
		return "Add-on has unreachable files"
	case "network-error":
		return "Server could not provide Add-on"
	case "not-found":
		return "Add-on does not exist"
	case "malformed-url":
		return "Invalid url"
	case "analyzing":
		return "Loading..."
	case "catch-all-error":
		return "Couldn't get Add-on"
	default:
		return ""
	}
}
