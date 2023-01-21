import {TextField, IconButton, Tooltip, Button} from "@mui/material"
import { useEffect, useState } from "react"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faArrowLeft, faPlus} from "@fortawesome/free-solid-svg-icons"
import {Link, useNavigate} from "react-router-dom"
import {GAME_CARGO_INDEX} from "../standardCargos"
import {useGlobalConfirm} from "../hooks/globalConfirm"
import {useAppShellContext} from "./store"
import {emptyCargoIndices, CargoIndices} from "../lib/shabah/backend"
import {useEffectAsync} from "../hooks/effectAsync"
import {
    addStandardCargosToCargoIndexes,
    STANDARD_MOD_CARGO_INDEX
} from "../standardCargos"
import {MOD_CARGO_ID_PREFIX} from "../config"

type ModLinkerProps = {
    onClose: () => void
    modIndexes: CargoIndices
}

const ModLinker = ({
    onClose,
    modIndexes
}: ModLinkerProps) => {
    
    useEffect(() => {
        const listener = (event: KeyboardEvent) => {
            const {key} = event
            if (key.toLowerCase() === "escape") {
                onClose()
            }
        }
        window.addEventListener("keyup", listener)
        return () => window.removeEventListener("keyup", listener)
    }, [])

    return <div
        className="animate-fade-in-left w-screen h-screen z-10 fixed top-0 left-0 flex items-center justify-center bg-neutral-900/80"
    >
        <div className="absolute top-0 left-0">
            <div className="mt-2 ml-2">
                <Tooltip title="Close">
                    <IconButton onClick={onClose}>
                        <FontAwesomeIcon icon={faArrowLeft}/>
                    </IconButton>
                </Tooltip>
            </div>
        </div>
        
        <div className="w-5/6 max-w-xl bg-neutral-800 rounded p-3 overflow-clip">
            <div className="mb-4">
                <div className="text-green-500 text-xs mb-1">
                    {"Linked"}
                </div>
                <div className="max-h-40 overflow-y-scroll w-full flex flex-wrap">
                    {modIndexes.cargos.map((mod, index) => {
                        return <div 
                            className="w-1/2"
                            key={`linked-mod-${index}`}
                        >
                            <button className="px-2 py-3 w-full text-sm rounded text-neutral-200 bg-neutral-700 hover:bg-neutral-900/50">
                                {mod.name}
                            </button>
                        </div> 
                    })}
                    
                </div>
            </div>

            <div>
                <div className="text-blue-500 text-xs mb-1">
                    {"Unlinked"}
                </div>
                <div className="h-40 bg-purple-500">

                </div>
            </div>
        </div>
    </div>
}

const NewGamePage = () => {
    const navigate = useNavigate()
    const confirm = useGlobalConfirm()
    const {downloadClient} = useAppShellContext()

    const [gameName, setGameName] = useState(`unnamed`)
    const [cargoIndices, setCargoIndices] = useState(emptyCargoIndices())
    const [showModLinker, setShowModLinker] = useState(true)

    useEffectAsync(async () => {
        const clientResponse = await downloadClient.getCargoIndices()
        const allCargos = addStandardCargosToCargoIndexes(clientResponse.cargos)
        const cargos = allCargos.filter((cargo) => cargo.id.startsWith(MOD_CARGO_ID_PREFIX))
        const first = cargos[0]
        for (let i = 0; i < 100; i++) {
            cargos.push({...first})
        }
        setCargoIndices({...clientResponse, cargos})
    }, [])

    return <div 
        className="fixed z-0 w-screen h-screen flex items-center justify-center top-0 left-0"
    >
        
        {showModLinker ? <>
            <ModLinker
                onClose={() => setShowModLinker(false)}
                modIndexes={cargoIndices}
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
                    navigate(`/extension?entry=${encodeURIComponent(GAME_CARGO_INDEX.entry)}&state=latest`)
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
                    >
                        Start
                    </Button>
                </div>
            </form>
        </div>
    </div>
}

export default NewGamePage