import { FilterOrder } from "../../components/FilterChevron"

export type Timestamps = {
    created: number
    updated: number
}

export type DatabaseEntry<Schema extends object> = (
    { id: number } 
    & Timestamps 
    & Schema
)

export type DatabaseMetadataModifiers<Document extends object> = {
    createTimestamps: (document: Document) => Document & Timestamps
    updateTimeStamps: (document: Document & Timestamps) => Document & Timestamps
}

export type QueryParams<T extends string = string> = {
    sort: T,
    order: FilterOrder
    offset: number
    limit: number
}

export function createMetadataModifiers<
    Document extends Object
>(): DatabaseMetadataModifiers<Document> {
    return {
        createTimestamps: (value) =>  ({...value, created: Date.now(), updated: Date.now()}),
        updateTimeStamps: (value) => ({...value, updated: Date.now()})
    }
}