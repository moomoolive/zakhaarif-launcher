import type {Database} from "./innerDatabase"
import {createMetadataModifiers, DatabaseEntry} from "./utilities"
import type {
	SaveType,
	ManualSave,
	QuickSave,
	AutoSave,
	SaveData
} from "zakhaarif-dev-tools"

export const MANUAL_SAVE: ManualSave = 1
export const AUTO_SAVE: AutoSave = 2
export const QUICK_SAVE: QuickSave = 3

export type GameSaveType = SaveType
// id will be added via "DatabaseEntry" Generic
export type GameSaveV1 = Omit<SaveData, "id"> & {
    content: object
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
		return {...dataWithTimestamps, id}
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