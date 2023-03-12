import {BYTES_PER_MB, BYTES_PER_GB, BYTES_PER_KB} from "../../utils/consts/storage"
import {roundDecimal} from "../../math/rounding"

const getBytesMetric = (bytes: number) => {
	if (bytes > BYTES_PER_GB) {
		return {factor: BYTES_PER_GB, metric: "gb"}
	} else if (bytes > BYTES_PER_MB) {
		return {factor: BYTES_PER_MB, metric: "mb"}
	} else {
		return {factor: BYTES_PER_KB, metric: "kb"}
	}
}

export const readableByteCount = (bytes: number) => {
	const {factor, metric} = getBytesMetric(bytes)
	const normalizedToMetric = roundDecimal(bytes / factor, 2)
	const metricCount = Math.max(0.01, normalizedToMetric)
	return {count: metricCount, metric}
}

export const toGigabytesString = (
	bytes: number, 
	decimals: number
) => {
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