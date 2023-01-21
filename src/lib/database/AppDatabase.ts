import Dexie from "dexie"

type GameSaveV1 = {
    id?: number
    name: string
    mods: {
        ids: string[]
        entryUrls: string[]
    }
    content: {}
    createdAt: number
    updatedAt: number
}

const DATABASE_NAME = "app-database"

export type GameSave = GameSaveV1

class InnerDatabase extends Dexie {
    gameSave!: Dexie.Table<GameSave, number>

    constructor() {
        super(DATABASE_NAME)
    }
}

export class AppDatabase {
    private db: InnerDatabase

    constructor() {
        this.db = new InnerDatabase()
    }

    clear() {
        return this.db.delete()
    }
}