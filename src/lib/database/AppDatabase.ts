import Dexie from "dexie"

type Timestamps = {
    createdAt: number
    updatedAt: number
}

type DatabaseEntry<Schema> = { id: number } & Timestamps & Schema

type GameSaveType = "manual" | "auto" | "quick"

type GameSaveV1 = {
    name: string
    type: GameSaveType
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

class GameSaveInterface {
    private db: InnerDatabase

    constructor(db: InnerDatabase) {
        this.db = db
    }

    async create(data: GameSaveV1) {
        const dataWithTimestamps = addTimestamps(data)
        const id = await this.db.gameSaves.put(dataWithTimestamps)
        return {id, ...dataWithTimestamps}
    }

    async getById(id: number) {
        return await this.db.gameSaves.get(id) as GameSave | undefined
    }

    async latest() {
        return await this.db.gameSaves
            .orderBy("updatedAt")
            .last() as GameSave | undefined
    }

    async getAll() {
        return await this.db.gameSaves.toArray() as Array<GameSave>
    }

    async updateOne(id: number, changes: GameSave) {
        const withTimestamps = updateTimestamps(changes)
        await this.db.gameSaves.update(id, changes)
        return withTimestamps
    }

    async deleteById(id: number) {
        return await this.db.gameSaves.delete(id)
    }
}

export class AppDatabase {
    private db: InnerDatabase

    gameSaves: GameSaveInterface

    constructor() {
        this.db = new InnerDatabase()
        this.gameSaves = new GameSaveInterface(this.db)
    }

    clear() {
        return this.db.delete()
    }
}