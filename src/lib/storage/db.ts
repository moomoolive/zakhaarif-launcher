import Dexie from "dexie"

type PackageRecord = {
    id?: number
    uuid: string
    name: string
    version: string
    type: "mod" | "extension"
    description: string
    entry: string
    displayPictureUrl: string
    authors: string,
    url: string
    files: {name: string, bytes: number}[]
    createdAt: Date
    updatedAt: Date
    meta: {
        source: string
        bytes: number
        schemaVersion: string
    }
}

class Database extends Dexie {
    packages!: Dexie.Table<PackageRecord, number>
    
    constructor() {
        super("app-db")
        this.version(1).stores({
            packages: "++id,uuid,name"
        })
    }
}

class AppDb {
    db: Database
    packages: PackagesDb

    constructor() {
        this.db = new Database()
        this.packages = new PackagesDb(this.db)
    }
}

class PackagesDb {
    private db: Database

    constructor(db: Database) {
        this.db = db
    }

    create(pkg: PackageRecord) {
        return this.db.packages.add(pkg)
    }

    findByName(name: string) {
        return this.db.packages.get({name})
    }

    findByUuid(uuid: string) {
        return this.db.packages.get({uuid})
    }
}

export const db = new AppDb()