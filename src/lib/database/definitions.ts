export type Timestamps = {
    createdAt: number
    updatedAt: number
}

export type DatabaseEntry<Schema> = { id: number } & Timestamps & Schema

export const MANUAL_SAVE = 1
export const AUTO_SAVE = 2
export const QUICK_SAVE = 3

export type GameSaveType = (
    typeof MANUAL_SAVE 
    | typeof AUTO_SAVE
    | typeof QUICK_SAVE
)

export type GameSaveV1 = {
    name: string
    type: GameSaveType
    mods: {
        canonicalUrls: string[]
        resolvedUrls: string[]
        entryUrls: string[]
    }
    content: {}
}

export type GameSave = DatabaseEntry<GameSaveV1>