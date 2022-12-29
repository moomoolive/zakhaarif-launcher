import {useState, useEffect, lazy, Suspense} from 'react'
import {
  createTheme,
  ThemeProvider,
} from "@mui/material"
import {LauncherRoot} from "./launcher/Root"
import {TerminalEngine} from "./lib/terminalEngine/index"
import {isIframe} from "./lib/checks/index"
import type {
  OutboundMessage as ServiceWorkerMessage
} from "@/lib/types/serviceWorkers"
import {featureCheck} from "@/lib/checks/features"

const AppShellRoot = lazy(() => import("./appShell/Root"))
const GameRoot = lazy(() => import("./game/Root"))
const Terminal = lazy(() => import("./components/terminal"))

const terminalState = {
  onBackTick: () => {}
}

const ALL_APIS_SUPPORTED = featureCheck()[5].supported

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

let serviceWorkerInitialized = false

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
  
  const [showTerminal, setShowTerminal] = useState(false)
  const [showLauncher, setShowLauncher] = useState((() => {
    if (
      isIframe()
      || firstQuery.mode === "game"
      || (import.meta.env.DEV && location.pathname !== "/")
    ) {
      return false
    }
    return true
  })())
  const [terminalEngine] = useState(new TerminalEngine())

  terminalState.onBackTick = () => {
    if (!showTerminal) {
      setShowTerminal(true)
    }
  }

  useEffect(() => {
    const callBack = (event: KeyboardEvent) => {
      if (event.key === "`") {
        terminalState.onBackTick()
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
        t.addCommandFn(
          name, 
          fn, 
          {source: "std"}
        )
      }
    })()
    }
    return () => window.removeEventListener("keyup", callBack)
  }, [])

  useEffect(() => {
    if (isIframe() || !ALL_APIS_SUPPORTED || serviceWorkerInitialized) {
      return
    }
    const swUrl = import.meta.env.DEV
      ? "dev-sw.js"
      : "sw.js"
    navigator.serviceWorker.register(swUrl)
    const prefix = "[👷 service-worker]: "
    navigator.serviceWorker.onmessage = (msg) => {
      const {type, contents} = msg.data as ServiceWorkerMessage
      const contentsWithPrefix = prefix + contents
      switch (type) {
        case "error":
          console.error(contentsWithPrefix)
          break
        case "info":
          console.info(contentsWithPrefix)
          break
        default:
          console.warn("recieved message from service worker that is encoded incorrectly", msg.data)
      }
    }
    serviceWorkerInitialized = true
  }, [])

  const globalState = {
    launchApp: () => setShowLauncher(false),
    setTerminalVisibility: setShowTerminal
  } as const

  return (
    <div>
      <main className="bg-neutral-800">
        <ThemeProvider theme={launcherTheme}>
            {showTerminal ? <>
              <Suspense>
                <Terminal
                  engine={terminalEngine}
                  onClose={() => setShowTerminal(false)}
                />
              </Suspense>
            </> : <></>}

            {isIframe() ? <>
              
              {((q: typeof firstQuery) => {
                const mode = q.mode || "default"
                switch (mode) {
                  case "game":
                    return <Suspense>
                      <GameRoot id={"game-root"}/>
                    </Suspense>
                  default:
                    return <></>
                }
              })(firstQuery)}

            </> : <>
              
              {showLauncher ? <>
                <LauncherRoot 
                  id={"launcher-root"}
                  globalState={globalState}
                />
              </>: <>
                <Suspense>
                  <AppShellRoot id={"app-shell-root"}/>
                </Suspense>
              </>}

            </>}
        </ThemeProvider>
      </main>
    </div>
  )
}

export default App
