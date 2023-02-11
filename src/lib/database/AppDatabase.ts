import {Timestamps, GameSaveV1, GameSave} from "./definitions"
import {Database} from "./innerDatabase"

export {MANUAL_SAVE, QUICK_SAVE, AUTO_SAVE} from "./definitions"

const addTimestamps = <O extends Object>(object: O) => {
    const now = Date.now()
    return {...object, createdAt: now, updatedAt: now}
}

const updateTimestamps = <O extends Timestamps>(object: O) => {
    object.updatedAt = Date.now()
    return object
}

class GameSaveInterface {
    private db: Database

    constructor(db: Database) {
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
    private db: Database
    gameSaves: GameSaveInterface

    constructor() {
        this.db = new Database()
        this.gameSaves = new GameSaveInterface(this.db)
    }

    async clear() {
        return this.db.delete()
    }
}