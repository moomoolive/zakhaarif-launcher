import {useState, useEffect, useRef} from 'react'
import {
  createTheme,
  ThemeProvider,
} from "@mui/material"
import {LauncherRoot} from "./launcher/Root"
import type {CommandDefinition, TerminalEngine} from "./lib/terminalEngine/index"
import {isIframe} from "./lib/checks/index"
import type {
  OutboundMessage as ServiceWorkerMessage
} from "@/lib/types/serviceWorkers"
import {featureCheck} from "@/lib/checks/features"
import {ConfirmProvider} from "material-ui-confirm"
import {lazyComponent} from "@/components/lazy"
import terminalLoadingElement from "@/components/loadingElements/terminal"

const AppShellRoot = lazyComponent(async () => (await import("./appShell/Root")).AppShellRoot)
const GameRoot = lazyComponent(async () => (await import("./game/Root")).GameRoot)
const Terminal = lazyComponent(async () => (await import("./components/terminal")).Terminal, {
  loadingElement: terminalLoadingElement
})

const terminalState = {
  onBackTick: () => {}
}

const ALL_APIS_SUPPORTED = featureCheck().every((feature) => feature.supported)

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
  const [terminalEngine, setTerminalEngine] = useState<null | TerminalEngine>(null)
  const importedTerminalComponents = useRef(false)

  terminalState.onBackTick = () => {
    if (!showTerminal) {
      setShowTerminal(true)
    }
  }

  useEffect(() => {
    if (
      !showTerminal 
      || importedTerminalComponents.current
    ) {
      return
    }
    (async () => {
      const [commandsStandardLibrary, terminalLibrary] = await Promise.all([
        import("./lib/terminalCommands"),
        import("./lib/terminalEngine/index")
      ] as const)
      const {TerminalEngine} = terminalLibrary
      const engine = new TerminalEngine()
      setTerminalEngine(engine)
      const {createCommands} = commandsStandardLibrary 
      const commands = createCommands({
        setShowTerminal, 
        setShowLauncher,
        source: "std"
      })
      for (let i = 0; i < commands.length; i++) {
        engine.addCommand(
          commands[i] as CommandDefinition
        )
      }
      importedTerminalComponents.current = true
    })()
  }, [showTerminal])

  useEffect(() => {
    const callBack = (event: KeyboardEvent) => {
      if (event.key === "`") {
        terminalState.onBackTick()
      }
    }
    window.addEventListener("keyup", callBack)
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
          <ConfirmProvider>
            {showTerminal ? <>
              <Terminal
                engine={terminalEngine}
                onClose={() => setShowTerminal(false)}
              />
            </> : <></>}

            {isIframe() ? <>
              
              {((query: typeof firstQuery) => {
                switch (query.mode || "default") {
                  case "game":
                    return <GameRoot id={"game-root"}/>
                  default:
                    return <div/>
                }
              })(firstQuery)}

            </> : <>
              
              {showLauncher ? <>
                <LauncherRoot 
                  id={"launcher-root"}
                  globalState={globalState}
                />
              </>: <>
                <AppShellRoot id={"app-shell-root"}/>
              </>}

            </>}
            </ConfirmProvider>
        </ThemeProvider>
      </main>
    </div>
  )
}

export default App
