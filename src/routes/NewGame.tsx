import {
    TextField, 
    IconButton, 
    Tooltip, 
    Button,
} from "@mui/material"
import {useState} from "react"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faArrowLeft, 
    faPlus, 
} from "@fortawesome/free-solid-svg-icons"
import {Link, useNavigate} from "react-router-dom"
import {useGlobalConfirm} from "../hooks/globalConfirm"
import {useAppShellContext} from "./store"
import {useEffectAsync} from "../hooks/effectAsync"
import {EXTENSION_SHELL_TARGET} from "../lib/utils/searchParameterKeys"
import type {CargoIndex} from "../lib/shabah/downloadClient"
import {ModLinker} from "../components/mods/ModLinker"
import {MANUAL_SAVE} from "../lib/database/GameSaves"
import {SAVE_EXISTS} from "../lib/utils/localStorageKeys"
import { isMod } from "../lib/utils/cargos"
import { sleep } from "../lib/utils/sleep"
import LoadingIcon from "../components/LoadingIcon"
import { STANDARD_CARGOS } from "../standardCargos"

const NewGamePage = () => {
    const navigate = useNavigate()
    const confirm = useGlobalConfirm()
    const {database, logger} = useAppShellContext()

    const [gameName, setGameName] = useState(`unnamed-${(Math.trunc(Math.random() * 99_999)).toString()}`)
    const [showModLinker, setShowModLinker] = useState(false)
    const [linkedMods, setLinkedMods] = useState([] as CargoIndex[])
    const [loading, setLoading] = useState(false)

    useEffectAsync(async () => {
        const standardMod = await database.cargoIndexes.getIndex(
            STANDARD_CARGOS[2].canonicalUrl
        )
        if (!standardMod) {
            logger.warn("standard mods were not found")
            setLinkedMods([])
            return  
        } 
        setLinkedMods([standardMod])
    }, [])

    return <div 
        className="fixed z-0 w-screen h-screen flex items-center justify-center top-0 left-0"
    >
        
        {showModLinker ? <>
            <ModLinker
                onClose={() => setShowModLinker(false)}
                linkedMods={linkedMods}
                setLinkedMods={setLinkedMods}
            />
        </> : <></>}

        <div className="absolute top-0 left-0">
            <div className="ml-2 mt-2">
                <Link to="/start">
                    <Tooltip title="Back">
                        <IconButton>
                            <FontAwesomeIcon icon={faArrowLeft}/>
                        </IconButton>
                    </Tooltip>
                </Link>
            </div>
        </div>

        <div className="w-4/5 mx-auto max-w-md">
            <div className="text-neutral-200 text-center mb-4">
                Create New Game
            </div>

            <form 
                onSubmit={async (event) => {
                    event.preventDefault()
                    if (!await confirm({title: "Are you sure you want to create a new game?"})) {
                        return
                    }
                    navigate(`/extension?${EXTENSION_SHELL_TARGET}=${encodeURIComponent(import.meta.env.VITE_APP_GAME_EXTENSION_CARGO_URL)}&state=-1`)
                }}
            >
                <div className="mb-1">
                    <TextField 
                        id="game-name"
                        name="game-name"
                        fullWidth
                        label="Name"
                        value={gameName}
                        onChange={(event) => setGameName(event.target.value)}
                    />
                </div>

                <div className="mb-4">
                    <Tooltip title="Link mods to new game" placement="right">
                        <Button 
                            size="small" 
                            color="success"
                            onClick={() => setShowModLinker(true)}
                        >
                            <span className="mr-2">
                                <FontAwesomeIcon
                                    icon={faPlus}
                                />
                            </span>
                            Mods
                        </Button>
                    </Tooltip>
                </div>

                <div>
                    <Button
                        size="large"
                        fullWidth
                        variant="contained"
                        type="submit"
                        onClick={async () => {
                            setLoading(true)
                            const mods = linkedMods.reduce((total, next) => {
                                total.canonicalUrls.push(next.canonicalUrl)
                                total.resolvedUrls.push(next.resolvedUrl)
                                total.entryUrls.push(next.entry)
                                return total
                            }, {
                                canonicalUrls: [] as string[],
                                resolvedUrls: [] as string[],
                                entryUrls: [] as string[],
                            })
                            const commitSavePromise = database.gameSaves.create({
                                name: gameName,
                                type: MANUAL_SAVE,
                                mods,
                                content: {}
                            })
                            console.log("database commit", commitSavePromise)
                            const [{id: gameId}] = await Promise.all([
                                commitSavePromise,
                                sleep(2_000)
                            ] as const) 
                            setLoading(false)
                            window.localStorage.setItem(SAVE_EXISTS, "1")
                            navigate(`/extension?${EXTENSION_SHELL_TARGET}=${encodeURIComponent(import.meta.env.VITE_APP_GAME_EXTENSION_CARGO_URL)}&state=${gameId}`)
                        }}
                        disabled={loading}
                    >
                        {loading? <span className="animate-spin text-blue-500">
                            <LoadingIcon/>
                        </span> : "Start"}
                    </Button>
                </div>
            </form>
        </div>
    </div>
}

export default NewGamePage