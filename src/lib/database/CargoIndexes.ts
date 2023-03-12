import type {Database} from "./innerDatabase"
import type {ManifestIndex} from "../shabah/downloadClient"
import {Timestamps, QueryParams} from "./utilities"
import {io} from "../monads/result"
import {EXTENSION_CARGO_TAG, MOD_CARGO_TAG} from "../../config"
import {ASCENDING_ORDER, FilterOrder} from "../../components/FilterChevron"
import Dexie from "dexie"

type AppCargoIndexV1 = Omit<ManifestIndex, ("created" | "updated")>

export type AppCargoIndex = AppCargoIndexV1 & Timestamps

export type AppCargoIndexedFields = (
    "updated"
    | "bytes" 
    | "name" 
    | "tag" 
    | "state"
    | "created"
)

export type SimilaritySearchParams = {
    text: string,
    sort: AppCargoIndexedFields
    order: FilterOrder
    limit: number
}

export class CargoIndexes {
	private db: Database

	constructor(db: Database) {
		this.db = db
	}

	async getIndex(canonicalUrl: string): Promise<AppCargoIndex | null> {
		const response = await io.wrap(this.db.appCargoIndexes.get(canonicalUrl))
		if (!response.ok || !response.data) {
			return null
		}
		return response.data
	}

	async getManyIndexes(canonicalUrls: string[]): Promise<Array<ManifestIndex | null>> {
		if (canonicalUrls.length < 1) {
			return []
		}
		const response = await this.db.appCargoIndexes.bulkGet(canonicalUrls)
		return response.map((cargo) => cargo || null)
	}
    
	async putIndex(index: ManifestIndex): Promise<boolean> {
		const response = await io.wrap(this.db.appCargoIndexes.put(index))
		return response.ok
	}

	async bulkPut(indexes: ManifestIndex[]): Promise<boolean> {
		const response = await io.wrap(
			this.db.appCargoIndexes.bulkPut(indexes)
		)
		return response.ok
	}

	async deleteIndex(canonicalUrl: string): Promise<boolean> {
		const response = await io.wrap(
			this.db.appCargoIndexes.delete(canonicalUrl)
		)
		return response.ok
	}

	async getExtensions(params: QueryParams<"updated" | "name">): Promise<AppCargoIndex[]> {
		const query = await this.orderedQuery(params)
		return query.filter(
			(cargo) => cargo.tag === EXTENSION_CARGO_TAG
		)
	}

	async getMods(params: QueryParams<"updated" | "name">): Promise<AppCargoIndex[]> {
		const query = await this.orderedQuery(params)
		return query.filter(
			(cargo) => cargo.tag === MOD_CARGO_TAG
		)
	}

	similaritySearchWithTag(
		tag: number,
		params: SimilaritySearchParams
	): Promise<ManifestIndex[]> {
		const {text, order, sort, limit} = params
		const baseQuery = this.db.appCargoIndexes.orderBy(sort)
		const ordered = order === ASCENDING_ORDER
			? baseQuery
			: baseQuery.reverse()
		const normalizedQuery = text.toLowerCase()
		return ordered
			.filter((cargo) => cargo.tag === tag && cargo.name.toLowerCase().includes(normalizedQuery))
			.limit(limit)
			.toArray()
	}

	countByTag(tag: number): Promise<number> {
		return this.db.appCargoIndexes.where("tag").equals(tag).count()
	}

	extensionCount(): Promise<number> {
		return this.countByTag(EXTENSION_CARGO_TAG)
	}

	modCount(): Promise<number> {
		return this.countByTag(MOD_CARGO_TAG)
	}

	cargoCount(): Promise<number> {
		return this.db.appCargoIndexes.count()
	}

	orderedQuery(params: QueryParams<AppCargoIndexedFields>): Promise<ManifestIndex[]> {
		const {limit, offset, sort, order} = params
		const initialQuery = this.db.appCargoIndexes
			.where(sort)
			.between(Dexie.minKey, Dexie.maxKey, true, true)
		const orderedQuery = order === ASCENDING_ORDER
			? initialQuery
			: initialQuery.reverse()
		return orderedQuery.offset(offset).limit(limit).toArray()
	}

	async latestUpdateTimestamp(): Promise<number> {
		const index = await this.db.appCargoIndexes
			.orderBy("updated")
			.reverse()
			.first()
		if (!index) {
			return Date.now()
		}
		return index.updated
	}

	similaritySearch(params: SimilaritySearchParams): Promise<ManifestIndex[]> {
		const {text, order, sort, limit} = params
		const normalizedQuery = text.toLowerCase()
		const baseQuery = this.db.appCargoIndexes
			.filter((cargo) => cargo.name.toLowerCase().includes(normalizedQuery))
			.limit(limit)
		const orderedQuery = order === ASCENDING_ORDER
			? baseQuery
			: baseQuery.reverse()
		return orderedQuery.sortBy(sort)
	}

	getAllCanonicalUrls(): Promise<string[]> {
		return this.db.appCargoIndexes
			.toCollection()
			.primaryKeys()
	}
}