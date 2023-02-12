import {useState, useEffect, useRef} from 'react'
import {createTheme, ThemeProvider} from "@mui/material"
import type {CommandDefinition, TerminalEngine} from "./lib/terminalEngine/index"
import {ConfirmProvider} from "material-ui-confirm"
import {lazyComponent} from "./components/Lazy"
import terminalLoadingElement from "./components/loadingElements/terminal"
import {useEffectAsync} from "./hooks/effectAsync"
import LoadingIcon from './components/LoadingIcon'
import { FEATURE_CHECK } from './lib/utils/featureCheck'

const AppRouter = lazyComponent(
  async () => (await import("./routes/Router")).AppRouter,
  {
    loadingElement: <div className="fixed top-0 left-0 h-screen w-screen flex items-center justify-center">
      <div>
        <div className="text-blue-500 animate-spin mb-4 text-center">
          <span className="text-4xl">
            <LoadingIcon/>
          </span>
        </div>
        <div className="text-neutral-400 animate-pulse">
          {"Starting app..."}
        </div>
      </div>
    </div>
  }
)
const Terminal = lazyComponent(async () => (await import("./components/Terminal")).Terminal, {
  loadingElement: terminalLoadingElement
})

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
  const [terminalEngine, setTerminalEngine] = useState<null | TerminalEngine>(null)
  
  const terminalReady = useRef(false)
  const serviceWorkerInitialized = useRef(false)
  const {current: ALL_APIS_SUPPORTED} = useRef(FEATURE_CHECK.every((feature) => feature.supported))
  const {current: terminalState} = useRef({
    onBackTick: () => {}
  })

  terminalState.onBackTick = () => {
    if (!showTerminal) {
      setShowTerminal(true)
    }
  }

  useEffectAsync(async () => {
    if (!showTerminal || terminalReady.current) {
      return
    }
    const [commandsStandardLibrary, terminalLibrary] = await Promise.all([
      import("./lib/utils/terminalStandardLibrary"),
      import("./lib/terminalEngine/index")
    ] as const)
    const {TerminalEngine} = terminalLibrary
    const engine = new TerminalEngine()
    setTerminalEngine(engine)
    const {createCommands} = commandsStandardLibrary 
    const commands = createCommands({
      setShowTerminal,
      source: "std"
    })
    for (let i = 0; i < commands.length; i++) {
      engine.addCommand(
        commands[i] as CommandDefinition
      )
    }
    terminalReady.current = true
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
    if (!ALL_APIS_SUPPORTED || serviceWorkerInitialized.current) {
      return
    }
    const swUrl = import.meta.env.DEV ? "dev-sw.compiled.js" : "sw.compiled.js"
    navigator.serviceWorker.register(swUrl)
    serviceWorkerInitialized.current = true
  }, [])

  return (
    <main>
      <ThemeProvider theme={launcherTheme}>
        <ConfirmProvider>
          {showTerminal ? <>
            <Terminal
              engine={terminalEngine}
              onClose={() => setShowTerminal(false)}
            />
          </> : <></>}

          <AppRouter setTerminalVisibility={setShowTerminal}/>

        </ConfirmProvider>
      </ThemeProvider>
    </main>
  )
}

export default App
