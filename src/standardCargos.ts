import {APP_CARGO_ID, GAME_EXTENSION_ID, STANDARD_MOD_ID} from "./config"

export const STANDARD_CARGOS = [
    {
      canonicalUrl: import.meta.env.VITE_APP_LAUNCHER_CARGO_URL, 
      id: APP_CARGO_ID
    },
    {
      canonicalUrl: import.meta.env.VITE_APP_GAME_EXTENSION_CARGO_URL,
      id: GAME_EXTENSION_ID
    },
    {
      canonicalUrl: import.meta.env.VITE_APP_STANDARD_MOD_CARGO_URL,
      id: STANDARD_MOD_ID
    }
] as const