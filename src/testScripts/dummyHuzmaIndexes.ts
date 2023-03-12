import type {ManifestIndex} from "../lib/shabah/downloadClient"
import {faker} from "@faker-js/faker"
import {EXTENSION_CARGO_TAG, MOD_CARGO_TAG} from "../config"
import {NULL_FIELD} from "huzma"
import {ManifestState} from "../lib/shabah/downloadClient"

export const makeTestHuzmaIndexes = (): ManifestIndex[] => {
	const data: ManifestIndex[] = []
	for (let i = 0; i < 5_000; i++) {
		const manifestName = "default.huzma.json"
		const canonicalUrl = faker.internet.url() + "/" + manifestName
		const created = new Date(
			faker.datatype.datetime({
				min: 0,
				max: Date.now()
			})
		).getTime()
		const next: ManifestIndex = {
			name: faker.random.words(),
			canonicalUrl,
			resolvedUrl: canonicalUrl,
			tag: i % 2 === 0 ? MOD_CARGO_TAG : EXTENSION_CARGO_TAG,
			logo: NULL_FIELD,
			bytes: faker.datatype.number(),
			entry: NULL_FIELD,
			version: faker.system.semver(),
			permissions: [],
			state: faker.datatype.number({min: 1, max: 4}) as ManifestState,
			downloadId: "",
			created,
			updated: created,
			manifestName
		}
		data.push(next)
	}
	return data
}