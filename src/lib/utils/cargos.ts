import {
    APP_CARGO_ID, 
    GAME_EXTENSION_ID, 
    MOD_CARGO_ID_PREFIX,
    ADDONS_EXENSTION_ID,
} from "../../config"

export const isStandardCargo = (id: string) => {
    switch (id) {
        case ADDONS_EXENSTION_ID:
        case GAME_EXTENSION_ID:
        case APP_CARGO_ID:
            return true
        default:
            return false
    }
}

export const isEmbeddedStandardCargo = (id: string) => {
    switch (id) {
        case ADDONS_EXENSTION_ID:
        case GAME_EXTENSION_ID:
            return true
        default:
            return false
    }
}

export const isMod = (id: string) => id.startsWith(MOD_CARGO_ID_PREFIX)

