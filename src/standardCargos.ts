import {
    GAME_EXTENSION_ID, 
    APP_CARGO_ID, 
    ADDONS_EXENSTION_ID
} from "./config"
import {NULL_FIELD as CARGO_NULL_FIELD} from "./lib/cargo/consts"
import {CargoIndex} from "./lib/shabah/wrapper"
import {Cargo} from "./lib/cargo/index"
import startGameUrl from "./game/main?url"
import addonsUrl from "./appShell/Addons?url"
import {stripRelativePath} from "./lib/utils/urls/stripRelativePath"
import {ADDONS_ESTIMATED_BYTES, GAME_ESTIMATED_BYTES} from "./cargosMeta"

const CURRENT_ORIGIN = window.location.origin + "/"

const GAME_RELATIVE_URL = stripRelativePath(startGameUrl)
export const GAME_CARGO = new Cargo({
    name: "Game",
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

const ADDONS_RELATIVE_URL = stripRelativePath(addonsUrl)
export const ADDONS_CARGO = new Cargo({
    name: "Add-ons",
    crateVersion: "0.1.0",
    entry: ADDONS_RELATIVE_URL,
    version: "0.1.0",
    files: [
        {name: ADDONS_RELATIVE_URL, bytes: ADDONS_ESTIMATED_BYTES}
    ]
})
export const ADDONS_CARGO_INDEX: Readonly<CargoIndex> = {
    id: ADDONS_EXENSTION_ID,
    name: "Add-ons",
    logoUrl: CARGO_NULL_FIELD,
    storageRootUrl: CURRENT_ORIGIN,
    requestRootUrl: CURRENT_ORIGIN,
    bytes: ADDONS_ESTIMATED_BYTES,
    entry: CURRENT_ORIGIN + ADDONS_RELATIVE_URL,
    version: "0.1.0",
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
        {...ADDONS_CARGO_INDEX, ...metadata}
    ]
}