import type {Database} from "./innerDatabase"
import {createMetadataModifiers, DatabaseEntry} from "./utilities"

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

const {
    createTimestamps, 
    updateTimeStamps
} = createMetadataModifiers<GameSaveV1>()

export class GameSaves {
    private db: Database

    constructor(db: Database) {
        this.db = db
    }

    async create(data: GameSaveV1): Promise<GameSave> {
        const dataWithTimestamps = createTimestamps(data)
        const id = await this.db.gameSaves.put(dataWithTimestamps)
        return {id, ...dataWithTimestamps}
    }

    async getById(id: number): Promise<GameSave | undefined> {
        return await this.db.gameSaves.get(id) as GameSave | undefined
    }

    async latest(): Promise<GameSave | undefined> {
        return await this.db.gameSaves
            .orderBy("updated")
            .last() as GameSave | undefined
    }

    async getAll(): Promise<Array<GameSave>> {
        return await this.db.gameSaves.toArray() as Array<GameSave>
    }

    async updateOne(id: number, changes: GameSave): Promise<GameSave> {
        const withTimestamps = updateTimeStamps(changes)
        await this.db.gameSaves.update(id, changes)
        return withTimestamps as GameSave
    }

    async deleteById(id: number): Promise<boolean> {
        await this.db.gameSaves.delete(id)
        return true
    }
}