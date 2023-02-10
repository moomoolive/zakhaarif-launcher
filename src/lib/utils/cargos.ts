import {EXTENSION_CARGO_TAG, MOD_CARGO_TAG} from "../../config"
import {CargoIndex} from "../shabah/downloadClient"

export const isStandardCargo = (cargo: CargoIndex): boolean => {
    switch (cargo.canonicalUrl) {
        case import.meta.env.VITE_APP_GAME_EXTENSION_CARGO_URL:
        case import.meta.env.VITE_APP_LAUNCHER_CARGO_URL:
        case import.meta.env.VITE_APP_STANDARD_MOD_CARGO_URL:
            return true
        default:
            return false
    }
}

export const isMod = (cargo: CargoIndex): boolean => cargo.tag === MOD_CARGO_TAG

export const isExtension = (cargo: CargoIndex): boolean => cargo.tag === EXTENSION_CARGO_TAG

export const EXTENSION_METADATA_KEY = "is-extension"