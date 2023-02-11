import Dexie from "dexie"
import type {GameSave} from "./definitions"

const DATABASE_NAME = "app-database"
const CURRENT_VERSION = 1

export class Database extends Dexie {
    gameSaves!: Dexie.Table<Omit<GameSave, "id">, number>

    constructor() {
        super(DATABASE_NAME)
        this.version(CURRENT_VERSION).stores({
            gameSaves: "++id, name, updatedAt"
        })
    }
}
