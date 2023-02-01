import {useState, useEffect, useRef} from 'react'
import {createTheme, ThemeProvider} from "@mui/material"
import type {CommandDefinition, TerminalEngine} from "./lib/terminalEngine/index"
import type {OutboundMessage as ServiceWorkerMessage} from "./lib/types/serviceWorkers"
import {featureCheck} from "./lib/utils/appFeatureCheck"
import {ConfirmProvider} from "material-ui-confirm"
import {lazyComponent} from "./components/Lazy"
import terminalLoadingElement from "./components/loadingElements/terminal"
import {useEffectAsync} from "./hooks/effectAsync"
import type {TopLevelAppProps} from "./lib/types/globalState"
import {Shabah} from "./lib/shabah/downloadClient"
import {APP_CACHE} from "./config"
import {webAdaptors} from "./lib/shabah/adaptors/web-preset"
import { cleanPermissions } from './lib/utils/security/permissionsSummary'

const AppRouter = lazyComponent(async () => (await import("./routes/Router")).AppRouter)
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
  const {current: globalState} = useRef<TopLevelAppProps>({
    setTerminalVisibility: setShowTerminal,
    downloadClient: new Shabah({
      origin: location.origin,
      adaptors: webAdaptors(APP_CACHE),
      permissionsCleaner: cleanPermissions
    }),
    sandboxInitializePromise: {
      resolve: () => {},
      reject: () => {},
      promise: Promise.resolve(true)
    }
  })

  const serviceWorkerInitialized = useRef(false)
  const {current: ALL_APIS_SUPPORTED} = useRef(featureCheck().every((feature) => feature.supported))
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

          <AppRouter globalState={globalState}/>

          </ConfirmProvider>
      </ThemeProvider>
    </main>
  )
}

export default App
