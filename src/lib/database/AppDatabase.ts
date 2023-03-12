import {Database, DATABASE_NAME, CURRENT_VERSION} from "./innerDatabase"
import {CargoIndexes} from "./CargoIndexes"
import {GameSaves} from "./GameSaves"

export class AppDatabase {
	private db: Database
	readonly gameSaves: GameSaves
	readonly cargoIndexes: CargoIndexes

	constructor() {
		this.db = new Database()
		this.gameSaves = new GameSaves(this.db)
		this.cargoIndexes = new CargoIndexes(this.db)
	}

	name(): string {
		return DATABASE_NAME
	}

	version(): number {
		return CURRENT_VERSION
	}

	async clear() {
		return this.db.delete()
	}
}