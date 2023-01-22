import {
    GAME_EXTENSION_ID, 
    APP_CARGO_ID,
    STANDARD_MOD_ID,
} from "./config"
import {CargoIndex} from "./lib/shabah/wrapper"
import {Cargo} from "./lib/cargo/index"
import startGameUrl from "./game/main?url"
import modStdUrl from "./modStd/main?url"
import {stripRelativePath} from "./lib/utils/urls/stripRelativePath"
import {GAME_ESTIMATED_BYTES, STANDARD_MOD_ESTIMATED_BYTES} from "./cargosMeta"

const CURRENT_ORIGIN = window.location.origin + "/"

const STANDARD_MOD_RELATIVE_URL = stripRelativePath(modStdUrl)
export const STANDARD_MOD_CARGO = new Cargo({
    name: "Std",
    description: "The one mod to rule them all. No seriously, the game needs this mod to function as it provides all the game's core code.",
    crateVersion: "0.1.0",
    entry: STANDARD_MOD_RELATIVE_URL,
    version: "0.1.0",
    files: [
        {name: STANDARD_MOD_RELATIVE_URL, bytes: STANDARD_MOD_ESTIMATED_BYTES}
    ]
})
export const STANDARD_MOD_CARGO_INDEX: Readonly<CargoIndex> = {
    id: STANDARD_MOD_ID,
    name: STANDARD_MOD_CARGO.name,
    logoUrl: STANDARD_MOD_CARGO.crateLogoUrl,
    storageRootUrl: CURRENT_ORIGIN,
    requestRootUrl: CURRENT_ORIGIN,
    bytes: GAME_ESTIMATED_BYTES,
    entry: CURRENT_ORIGIN + STANDARD_MOD_RELATIVE_URL,
    version: STANDARD_MOD_CARGO.version,
    state: "cached",
    createdAt: 0,
    updatedAt: 0
}

const GAME_RELATIVE_URL = stripRelativePath(startGameUrl)
export const GAME_CARGO = new Cargo({
    name: "Game",
    description: "Starts game loop and injects any linked mods",
    crateVersion: "0.1.0",
    entry: GAME_RELATIVE_URL,
    version: "0.1.0",
    files: [
        {name: GAME_RELATIVE_URL, bytes: GAME_ESTIMATED_BYTES}
    ]
})

export const GAME_CARGO_INDEX: Readonly<CargoIndex> = {
    id: GAME_EXTENSION_ID,
    name: GAME_CARGO.name,
    logoUrl: GAME_CARGO.crateLogoUrl,
    storageRootUrl: CURRENT_ORIGIN,
    requestRootUrl: CURRENT_ORIGIN,
    bytes: GAME_ESTIMATED_BYTES,
    entry: CURRENT_ORIGIN + GAME_RELATIVE_URL,
    version: GAME_CARGO.version,
    state: "cached",
    createdAt: 0,
    updatedAt: 0
}

export const addStandardCargosToCargoIndexes = (indexes: CargoIndex[]) => {
    const appCargoIndex = indexes.findIndex((cargo) => cargo.id === APP_CARGO_ID)
    const targetCargo = appCargoIndex < 0 ? null : indexes[appCargoIndex]
    const updatedAt = targetCargo ? targetCargo.updatedAt : 0
    const createdAt = targetCargo ? targetCargo.createdAt : 0
    const metadata = {updatedAt, createdAt}
    return [
        ...indexes,
        {...GAME_CARGO_INDEX, ...metadata},
        {...STANDARD_MOD_CARGO_INDEX, ...metadata}
    ]
}