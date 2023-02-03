import {Button} from "@mui/material"
import {Link} from "react-router-dom"
//import {GAME_CARGO_INDEX} from "../standardCargos"
import {SAVE_EXISTS} from "../lib/utils/localStorageKeys"
import { useRef, useState } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faAngleDown, faAngleUp } from "@fortawesome/free-solid-svg-icons"
import { FadeIn } from "../components/FadeIn"

const StartMenuPage = () => {
    const gameSaveExists = useRef(Boolean(window.localStorage.getItem(SAVE_EXISTS)))
    const [expandSettings, setExpandSettings] = useState(false)

    return <div 
        className="fixed z-0 w-screen h-screen flex overflow-clip"
    >   
        <div className="flex z-20 items-center justify-start h-full w-full max-w-screen-lg mx-auto">
            <div 
                className="w-3/5 mx-auto sm:mx-0 sm:ml-16 h-full sm:w-60 bg-neutral-900/70 flex items-center justify-center"
            >
                <div className="w-full">
                    {gameSaveExists.current ? <>
                        <div>
                            <Link 
                                to={`/extension?entry=${encodeURIComponent(import.meta.env.VITE_APP_GAME_EXTENSION_ENTRY_URL)}&state=-1`}
                                style={gameSaveExists.current 
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

                    <div>
                        <Button 
                            color={expandSettings ? "warning" : "info"}
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

                    <FadeIn show={expandSettings}>
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
                    </FadeIn>

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
                </div>
            </div>
        </div>
    </div>
}

export default StartMenuPage