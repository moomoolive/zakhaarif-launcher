import {Shabah} from "../shabah/index"
import {APP_CACHE} from "../consts"

export const shabah = new Shabah({
    apps: {
      appShell: {
        id: 1,
        appRootUrl: import.meta.env.VITE_CARGO_APP_SHELL_ROOT_URL,
        htmlTitle: import.meta.env.VITE_APP_TITLE,
        permissions: {}
      },
      gameCore: {
        id: 2,
        appRootUrl: import.meta.env.VITE_CARGO_GAME_CORE_ROOT_URL,
        htmlTitle: "none",
        permissions: {}
      }
    },
    mode: "dev",
    cacheName: APP_CACHE,
    loggingMode: "verbose"
})

export type AppController = typeof shabah