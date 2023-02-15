import Dexie from "dexie"
import { AppCargoIndex } from "./CargoIndexes"
import type {GameSave} from "./GameSaves"

export const DATABASE_NAME = "app-database"
export const CURRENT_VERSION = 1

export class Database extends Dexie {
    gameSaves!: Dexie.Table<Omit<GameSave, "id">, number>
    appCargoIndexes!: Dexie.Table<AppCargoIndex, string>

    constructor() {
        super(DATABASE_NAME)
        this.version(CURRENT_VERSION).stores({
            gameSaves: "++id, name, updated, created",
            appCargoIndexes: "canonicalUrl, updated, created, bytes, name, tag, state"
        })
    }
}
