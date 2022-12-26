import {useState, useEffect, lazy, Suspense} from 'react'
import {
  createTheme,
  ThemeProvider,
} from "@mui/material"
import {LauncherRoot} from "./launcher/Root"
import {Shabah} from "../shabah/index"
import {APP_CACHE} from "../consts"
import type {OutboundMessage as ServiceWorkerMessage} from "../serviceWorkers/types"
import {storeContext} from  "./store"
import {Terminal} from "./components/terminal"
import {TerminalEngine} from "../terminalEngine/index"
import {isIframe} from "./lib/checks/index"

const enum log {
  name = "[🤖 app-controller]:",
  sw = "[💾 service-worker]:"
}

const AppShellRoot = lazy(() => import("./appShell/Root"))
const GameRoot = lazy(() => import("./game/Root"))

const parseQuery = (query: string) => {
  const record = {} as Record<string, string>
  const withoutQuestionMark = query.split("?")
  if (withoutQuestionMark.length < 2) {
    return record
  }
  const base = withoutQuestionMark[1]
  const parts = base.split("&").filter(s => s.length > 0)
  if (parts.length < 1) {
    return record
  }
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const parsedTerm = part.split("=")
    if (parsedTerm.length === 1) {
      record[parsedTerm[0]] = "true"
    } else if (parsedTerm.length > 1) {
      record[parsedTerm[0]] = parsedTerm[1]
    }
  }
  return record
}

const firstQuery = parseQuery(location.search)

const isLoadedInIframe = isIframe()

const  App = () => {
  const [launcherTheme] = useState(createTheme({
    palette: {
      mode: "dark",
      primary: {
        main: "#0077c0"
      },
      secondary: {
        main: "#c4ced4"
      },
    }
  }))

  const [appController] = useState(new Shabah({
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
    mode: isLoadedInIframe ? "prod" : "dev",
    cacheName: APP_CACHE,
    loggingMode: "verbose"
  }))

  useEffect(() => {
    if (isLoadedInIframe || !navigator.serviceWorker || !import.meta.env.PROD) {
      return
    }
    const url = "sw.js"
    navigator.serviceWorker.register(url, {scope: "/"})
    navigator.serviceWorker.addEventListener("message", (msg) => {
      const {type, contents} = msg.data as ServiceWorkerMessage
      switch (type) {
        case "info":
          console.info(log.sw, contents)
          break
        case "error":
          console.error(log.sw, contents)
          break
        default:
          console.warn(log.name, "recieved msg from service worker, but it was encoded incorrectly")
          break
      }
    })
  }, [])

  

  const [showTerminal, setShowTerminal] = useState(false)
  const [showLauncher, setShowLauncher] = useState(
    firstQuery.mode === "game" ? false : true
  )
  const [terminalEngine] = useState(new TerminalEngine())

  useEffect(() => {
    const callBack = (event: KeyboardEvent) => {
      if (event.key === "`") {
        setShowTerminal(val => !val)
      }
    }
    window.addEventListener("keyup", callBack)
    
    const t = terminalEngine
    {
    (async () => {
      const {createCommands} = await import("./lib/terminalCommands")
      const commands = createCommands({
        setShowTerminal, 
        setShowLauncher
      })
      for (let i = 0; i < commands.length; i++) {
        const {name, fn} = commands[i]
        t.addCommandFn(name, fn)
      }
    })()
    }
    return () => window.removeEventListener("keyup", callBack)
  }, [])

  return (
    <div>
      <main className="bg-neutral-800">
        <ThemeProvider theme={launcherTheme}>
          <storeContext.Provider
            value={{
              launchApp: () => setShowLauncher(false),
              downloadClient: appController,
              setTerminalVisibility: setShowTerminal
            }}
          >
            {showTerminal ? <>
              <Suspense>
                <Terminal
                  engine={terminalEngine}
                />
              </Suspense>
            </> : <></>}

            {showLauncher ? <>
              <LauncherRoot id={"launcher-root"}/>
            </> : <>
            {((q: typeof firstQuery) => {
              const mode = q.mode || "default"
              switch (mode) {
                case "game":
                  return <Suspense>
                    <GameRoot id={"game-root"}/>
                  </Suspense>
                default:
                  return <Suspense>
                    <AppShellRoot id={"app-shell-root"}/>
                  </Suspense>
              }
            })(firstQuery)}
            </>}
          </storeContext.Provider>
        </ThemeProvider>
      </main>
    </div>
  )
}

export default App
