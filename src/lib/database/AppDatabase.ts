import Dexie from "dexie"

type Timestamps = {
    createdAt: number
    updatedAt: number
}

type DatabaseEntry<Schema> = { id: number } & Timestamps & Schema

type GameSaveV1 = {
    name: string
    mods: {
        canonicalUrls: string[]
        entryUrls: string[]
    }
    content: {}
}

export type GameSave = DatabaseEntry<GameSaveV1>

const DATABASE_NAME = "app-database"
const CURRENT_VERSION = 1

class InnerDatabase extends Dexie {
    gameSaves!: Dexie.Table<Omit<GameSave, "id">, number>

    constructor() {
        super(DATABASE_NAME)
        this.version(CURRENT_VERSION).stores({
            gameSaves: "++id, name, updatedAt"
        })
    }
}

const addTimestamps = <O extends Object>(object: O) => {
    const now = Date.now()
    return {...object, createdAt: now, updatedAt: now}
}

const updateTimestamps = <O extends Timestamps>(object: O) => {
    object.updatedAt = Date.now()
    return object
}

export class AppDatabase {
    private db: InnerDatabase

    constructor() {
        this.db = new InnerDatabase()
    }

    async createGameSave(data: GameSaveV1) {
        const dataWithTimestamps = addTimestamps(data)
        const id = await this.db.gameSaves.put(dataWithTimestamps)
        return {id, ...dataWithTimestamps}
    }

    async getGameSaveById(id: number) {
        return await this.db.gameSaves.get(id) as GameSave | undefined
    }

    async getLatestSave() {
        return await this.db.gameSaves
            .orderBy("updatedAt")
            .last() as GameSave | undefined
    }

    clear() {
        return this.db.delete()
    }
}