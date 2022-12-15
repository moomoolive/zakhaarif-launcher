import {useState, useEffect, lazy, Suspense} from 'react'
import {
  createTheme,
  ThemeProvider
} from "@mui/material"
import {Launcher} from "./Launcher"
import {Shabah} from "../shabah/index"
import {APP_CACHE} from "../consts"
import type {OutboundMessage as ServiceWorkerMessage} from "../serviceWorkers/types"
import {storeContext} from  "./store/index"
import {Terminal} from "./components/terminal"
import {TerminalEngine} from "../terminalEngine/index"

const enum log {
  name = "[🤖 app-controller]:",
  sw = "[💾 service-worker]:"
}

const AppRoot = lazy(() => import("./AppRoot"))

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
    mode: "dev",
    cacheName: APP_CACHE,
    loggingMode: "verbose"
  }))

  useEffect(() => {
    if (!navigator.serviceWorker || !import.meta.env.PROD) {
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
  const [showLauncher, setShowLauncher] = useState(true)
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
              <Terminal
                engine={terminalEngine}
              />
            </> : <></>}

            {showLauncher ? <>
              <Launcher id={"app-shell-launcher"}/>
            </> : <>
              <Suspense>
                <AppRoot id={"app-shell-root"}/>
              </Suspense>
            </>}
          </storeContext.Provider>
        </ThemeProvider>
      </main>
    </div>
  )
}

export default App
