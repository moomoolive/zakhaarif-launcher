import {useState} from "react"
import {useAppContext} from "../store"
import {Divider, Switch} from "@mui/material"
import {useGlobalConfirm} from "../../hooks/globalConfirm"
import {LOCAL_STORAGE_KEYS} from "../../lib/consts"

const {ALLOW_UNSAFE_PACKAGES, VERBOSE_LAUNCHER_LOGS} = LOCAL_STORAGE_KEYS

export function DeveloperOptions(): JSX.Element {
	const confirm = useGlobalConfirm()
	const {logger} = useAppContext()
    
	const [unsafePermissions, setUnsafePermissions] = useState(
		!!localStorage.getItem(ALLOW_UNSAFE_PACKAGES)
	)
	const [verboseLogs, setVerboseLogs] = useState(
		localStorage.getItem(VERBOSE_LAUNCHER_LOGS) === "true"
	)

	return <div>
		<div className="mb-8">
			<div>
				<Switch 
					id="unsafe-permissions-switch"
					name="unsafe-permissions"
					color="success"
					checked={verboseLogs}
					onChange={async (event) => {
						if (event.target.checked) {
							logger.silent = false
							console.info("[🐸 Frogger]: Logging has been turned on!")
							setVerboseLogs(true)
							localStorage.setItem(VERBOSE_LAUNCHER_LOGS, "true")
						} else {
							console.info("[🐸 Frogger]: Logging has been switched off. Goodbye!")
							logger.silent = true
							setVerboseLogs(false)
							localStorage.setItem(VERBOSE_LAUNCHER_LOGS, "false")
						} 
					}}
					inputProps={{"aria-label": "controlled"}}
				/>
				<span>
					{"Launcher Logs"}
				</span>
			</div>
		</div>
        
		<div className="mx-2">
			<Divider/>
		</div>
        
		<div className="mx-2.5 mt-2 mb-1">
			<div className="text-sm text-red-500">
				{"Unsafe Options"}
			</div>
		</div>

		<div>
			<Switch 
				id="unsafe-permissions-switch"
				name="unsafe-permissions"
				color="error"
				checked={unsafePermissions}
				onChange={async (event) => {
					if (
						event.target.checked 
                        && (await confirm({title: "Are you sure you want to allow unsafe packages?", description: "This should only be used for development purposes. Use this option at your own risk!", confirmButtonColor: "error"}))
					) {
						setUnsafePermissions(true)
						localStorage.setItem(ALLOW_UNSAFE_PACKAGES, "true")
					} else {
						setUnsafePermissions(false)
						localStorage.removeItem(ALLOW_UNSAFE_PACKAGES)
					} 
				}}
				inputProps={{"aria-label": "controlled"}}
			/>
			<span>
				{"Allow Unsafe Packages"}
			</span>
		</div>
	</div>
}