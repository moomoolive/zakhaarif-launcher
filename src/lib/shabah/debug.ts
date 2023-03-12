import {STATUS_CODES, StatusCode} from "./client"

export type DebugStatusName = (
    keyof typeof STATUS_CODES 
    | "statusCodeDoesNotExist"
)

type StatusCodeList = {name: DebugStatusName,  code: StatusCode}[]

const iter = Object.entries(STATUS_CODES)
export const statusCodesList: StatusCodeList = [...iter].map(
	([key, code]) => ({name: key as DebugStatusName, code})
)

export function debugStatusCode(code: StatusCode): DebugStatusName {
	const targetIndex = statusCodesList.findIndex(
		(item) => item.code === code
	)
	if (targetIndex < 0) {
		return "statusCodeDoesNotExist"
	}
	return statusCodesList[targetIndex].name
}