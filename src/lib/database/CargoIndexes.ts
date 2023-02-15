import type {Database} from "./innerDatabase"
import type {CargoIndex} from "../shabah/downloadClient"
import {Timestamps, QueryParams} from "./utilities"
import {io} from "../monads/result"
import { EXTENSION_CARGO_TAG, MOD_CARGO_TAG } from "../../config"
import {ASCENDING_ORDER, FilterOrder} from "../../components/FilterChevron"
import Dexie from "dexie"

type AppCargoIndexV1 = Omit<CargoIndex, ("created" | "updated")>

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
    
    async putIndex(index: CargoIndex): Promise<boolean> {
        const response = await io.wrap(this.db.appCargoIndexes.put(index))
        return response.ok
    }

    async bulkPut(indexes: CargoIndex[]): Promise<boolean> {
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

    getExtensions(params: QueryParams<"updated" | "name">): Promise<AppCargoIndex[]> {
        const {limit, offset, sort, order} = params
        const initialQuery = this.db.appCargoIndexes
            .where("tag")
            .equals(EXTENSION_CARGO_TAG)
            .offset(offset)
            .limit(limit)
        if (order === ASCENDING_ORDER) {
            return initialQuery.sortBy(sort)
        }
        return initialQuery.reverse().sortBy(sort)
    }

    async extensionCount(): Promise<number> {
        return await this.db.appCargoIndexes
            .where("tag")
            .equals(EXTENSION_CARGO_TAG)
            .count()
    }

    cargoCount(): Promise<number> {
        return this.db.appCargoIndexes.count()
    }

    orderedQuery(params: QueryParams<AppCargoIndexedFields>): Promise<CargoIndex[]> {
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
        const index = await this.db.appCargoIndexes.orderBy("updated").first()
        if (!index) {
            return Date.now()
        }
        return index.updated
    }

    similaritySearch(params: SimilaritySearchParams): Promise<CargoIndex[]> {
        const {text, order, sort, limit} = params
        const baseQuery = this.db.appCargoIndexes
            .filter((cargo) => cargo.name.includes(text))
            .limit(limit)
        const orderedQuery = order === ASCENDING_ORDER
            ? baseQuery
            : baseQuery.reverse()
        return orderedQuery.sortBy(sort)
    }
}