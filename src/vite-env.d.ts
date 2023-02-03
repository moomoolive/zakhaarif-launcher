/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_TITLE: string
    readonly VITE_APP_CODE_REPO_URL: string
    readonly VITE_APP_RELEASE_NOTES_URL: string
    readonly VITE_APP_SANDBOX_ORIGIN: string

    // standard cargos
    readonly VITE_APP_LAUNCHER_CARGO_URL: string
    readonly VITE_APP_GAME_EXTENSION_CARGO_URL: string
    readonly VITE_APP_GAME_EXTENSION_ENTRY_URL: string
    readonly VITE_APP_STANDARD_MOD_CARGO_URL: string
  }
