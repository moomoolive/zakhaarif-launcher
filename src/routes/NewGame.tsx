import {
    TextField, 
    IconButton, 
    Tooltip, 
    Button,
} from "@mui/material"
import {useState, useRef} from "react"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {
    faArrowLeft, 
    faPlus, 
} from "@fortawesome/free-solid-svg-icons"
import {Link, useNavigate} from "react-router-dom"
import {GAME_CARGO_INDEX} from "../standardCargos"
import {useGlobalConfirm} from "../hooks/globalConfirm"
import {useAppShellContext} from "./store"
import {emptyCargoIndices} from "../lib/shabah/backend"
import {useEffectAsync} from "../hooks/effectAsync"
import {addStandardCargosToCargoIndexes} from "../standardCargos"
import {MOD_CARGO_ID_PREFIX} from "../config"
import type {CargoIndex} from "../lib/shabah/wrapper"
import {ModLinker} from "../components/mods/ModLinker"
import {AppDatabase} from "../lib/database/AppDatabase"
import {SAVE_EXISTS} from "../lib/utils/localStorageKeys"

const NewGamePage = () => {
    const navigate = useNavigate()
    const confirm = useGlobalConfirm()
    const {downloadClient} = useAppShellContext()

    const [gameName, setGameName] = useState(`unnamed`)
    const [cargoIndices, setCargoIndices] = useState(emptyCargoIndices())
    const [showModLinker, setShowModLinker] = useState(false)
    const [linkedMods, setLinkedMods] = useState([] as CargoIndex[])
    const [loading, setLoading] = useState(false)

    const {current: appDatabase} = useRef(new AppDatabase())

    useEffectAsync(async () => {
        const clientResponse = await downloadClient.getCargoIndices()
        const allCargos = addStandardCargosToCargoIndexes(clientResponse.cargos)
        const cargos = allCargos.filter((cargo) => cargo.id.startsWith(MOD_CARGO_ID_PREFIX))
        const standardMod = cargos[0]
        setLinkedMods([standardMod])
        setCargoIndices({...clientResponse, cargos})
    }, [])

    return <div 
        className="fixed z-0 w-screen h-screen flex items-center justify-center top-0 left-0"
    >
        
        {showModLinker ? <>
            <ModLinker
                onClose={() => setShowModLinker(false)}
                modIndexes={cargoIndices}
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
                    navigate(`/extension?entry=${encodeURIComponent(GAME_CARGO_INDEX.entry)}&state=-1`)
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
                            const {id: gameId} = await appDatabase.gameSaves.create({
                                name: gameName,
                                type: "manual",
                                mods: {
                                    canonicalUrls: linkedMods.map((cargo) => cargo.canonicalUrl),
                                    entryUrls: linkedMods.map((cargo) => cargo.entry),
                                },
                                content: {}
                            })
                            setLoading(false)
                            window.localStorage.setItem(SAVE_EXISTS, "1")
                            navigate(`/extension?entry=${encodeURIComponent(GAME_CARGO_INDEX.entry)}&state=${gameId}`)
                        }}
                        disabled={loading}
                    >
                        {loading? <span className="animate-pulse">{"Loading..."}</span> : "Start"}
                    </Button>
                </div>
            </form>
        </div>
    </div>
}

export default NewGamePage