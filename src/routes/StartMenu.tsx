import {Button, Collapse, Tooltip} from "@mui/material"
import {Link} from "react-router-dom"
import {SAVE_EXISTS} from "../lib/utils/localStorageKeys"
import {useRef, useState} from "react"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faAngleDown, faAngleUp} from "@fortawesome/free-solid-svg-icons"
import {EXTENSION_SHELL_TARGET} from "../lib/utils/searchParameterKeys"
import {useAsyncState} from "../hooks/promise"
import {GAME_EXTENSION_CARGO, STANDARD_CARGOS} from "../standardCargos"
import {useAppContext} from "./store"
import {CACHED} from "../lib/shabah/backend"

const StartMenuPage = () => {
	const {downloadClient} = useAppContext()
	const [gameMetadata] = useAsyncState(downloadClient.getCargoIndexByCanonicalUrl(STANDARD_CARGOS[1].canonicalUrl))

	const [expandSettings, setExpandSettings] = useState(false)
	const gameSaveExists = useRef(!!window.localStorage.getItem(SAVE_EXISTS))

	const gameIsCached = gameMetadata.data?.state === CACHED

	return <div 
		className="fixed z-0 w-screen h-screen flex overflow-clip"
	>   
		<div className="flex relative z-20 items-center justify-start h-full w-full max-w-screen-lg mx-auto">
			<div className="w-3/5 relative mx-auto sm:mx-0 sm:ml-16 h-full sm:w-60 bg-neutral-900/70 flex items-center justify-center">
				{gameMetadata.loading ? <></> : <>
					<Tooltip title="Game Version" placement="top">
						<div className="absolute z-30 text-neutral-400 bottom-6 animate-fade-in-left">
							{gameMetadata.data
								? "v" + gameMetadata.data.version
								: "Not Installed"
							}
						</div>
					</Tooltip>
				</>}
                
				<div className="w-full">
					<Collapse in={!expandSettings}>
						{gameSaveExists.current ? <>
							<div>
								<Link 
									to={`/extension?${EXTENSION_SHELL_TARGET}=${encodeURIComponent(GAME_EXTENSION_CARGO.canonicalUrl)}&state=-1`}
									style={gameIsCached && gameSaveExists.current 
										? {}
										: {pointerEvents: "none"}
									}
								>
									<Button 
										color="success"
										fullWidth 
										size="large"
									>
										{"Continue"}
									</Button>
								</Link>
							</div>
						</> : <></>}

						<div>
							<Link to="/new-game">
								<Button 
									color="success"
									fullWidth 
									size="large"
									disabled={!gameIsCached}
								>
									{"New Game"}
								</Button>
							</Link>
						</div>

						{gameSaveExists.current ? <>
							<div>
								<Link to="/load-game">
									<Button 
										color="success"
										fullWidth 
										size="large"
									>
										{"Load Game"}
									</Button>
								</Link>
							</div>
						</> : <></>}
					</Collapse>

					<div>
						<Button 
							color={expandSettings ? "success" : "info"}
							fullWidth 
							size="large"
							onClick={() => setExpandSettings(!expandSettings)}
						>
							{"Settings"}
                            
							<span className="ml-1">
								{expandSettings 
									? <FontAwesomeIcon icon={faAngleUp} /> 
									: <FontAwesomeIcon icon={faAngleDown} />
								}
							</span>
						</Button>
					</div>

					<Collapse in={expandSettings}>
						<div>
							<Link to="/settings">
								<Button 
									color="info"
									fullWidth 
									size="large"
								>
									{"General"}
								</Button>
							</Link>
						</div>

						<div>
							<Link to="/add-ons">
								<Button 
									color="info"
									fullWidth 
									size="large"
								>
									{"Add-ons"}
								</Button>
							</Link>
						</div>

						<div>
							<Link to="/extensions-list">
								<Button 
									color="info"
									fullWidth 
									size="large"
								>
									{"Extensions"}
								</Button>
							</Link>
						</div>

						<div>
							<Button 
								color="warning"
								fullWidth 
								size="large"
								onClick={() => setExpandSettings(false)}
							>
								{"Back"}
							</Button>
						</div>
					</Collapse>

					<Collapse in={!expandSettings}>
						<div>
							<Link to="/">
								<Button 
									color="warning"
									fullWidth 
									size="large"
								>
									{"Launcher"}
								</Button>
							</Link>
						</div>
					</Collapse>
				</div>
			</div>
		</div>
	</div>
}

export default StartMenuPage