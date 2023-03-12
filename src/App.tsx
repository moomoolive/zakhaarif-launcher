import {useState, useEffect, useRef} from "react"
import {createTheme, ThemeProvider} from "@mui/material"
import {ConfirmProvider} from "material-ui-confirm"
import {lazyComponent} from "./components/Lazy"
import LoadingIcon from "./components/LoadingIcon"
import {FEATURE_CHECK} from "./lib/utils/featureCheck"

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
  
	const serviceWorkerInitialized = useRef(false)
	const {current: ALL_APIS_SUPPORTED} = useRef(FEATURE_CHECK.every((feature) => feature.supported))

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
					<AppRouter/>
				</ConfirmProvider>
			</ThemeProvider>
		</main>
	)
}

export default App
