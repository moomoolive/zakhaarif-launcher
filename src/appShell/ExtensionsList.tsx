import {useAppShellContext} from "./store"
import {emptyCargoIndices} from "../lib/shabah/backend"
import {CargoIndex} from "../lib/shabah/wrapper"
import { useState } from "react"
import {useEffectAsync} from "../hooks/effectAsync"
import {io} from "../lib/monads/result"
import {FullScreenLoadingOverlay} from "../components/LoadingOverlay"
import {ErrorOverlay} from "../components/ErrorOverlay"
import {Link} from "react-router-dom"
import {Button, IconButton, Tooltip} from "@mui/material"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faArrowLeft, faPuzzlePiece} from "@fortawesome/free-solid-svg-icons"
import {
    APP_CARGO_ID, 
    GAME_EXTENSION_ID, 
    ADD_ON_MANAGER_EXTENSION_ID
} from "../config"
import {NULL_FIELD as CARGO_NULL_FIELD} from "../lib/cargo/consts"
import {CargoIcon} from "../components/cargo/Icon"

const GAME_CARGO_INDEX: CargoIndex = {
    id: GAME_EXTENSION_ID,
    name: "Game",
    logoUrl: CARGO_NULL_FIELD,
    storageRootUrl: "",
    requestRootUrl: "",
    bytes: 0,
    entry: "",
    version: "0.1.0",
    state: "cached",
    createdAt: 0,
    updatedAt: 0
} as const

const ADD_ON_MANAGER_CARGO_INDEX: CargoIndex = {
    id: ADD_ON_MANAGER_EXTENSION_ID,
    name: "Add-ons",
    logoUrl: CARGO_NULL_FIELD,
    storageRootUrl: "",
    requestRootUrl: "",
    bytes: 0,
    entry: "",
    version: "0.1.0",
    state: "cached",
    createdAt: 0,
    updatedAt: 0
} as const

const ExtensionsListPage = () => {
    const {downloadClient} = useAppShellContext()

    const [cargoIndex, setCargoIndex] = useState(emptyCargoIndices())
    const [error, setError] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffectAsync(async () => {
        const indicesRes = await io.wrap(downloadClient.getCargoIndices())
        if (!indicesRes.ok) {
            setError(true)
            setLoading(false)
            return
        }
        const {data} = indicesRes
        const cargos = data.cargos.filter((cargo) => (cargo.id !== APP_CARGO_ID && cargo.state === "cached"))
        cargos.push(
            {...GAME_CARGO_INDEX},
            {...ADD_ON_MANAGER_CARGO_INDEX}
        )
        setCargoIndex({...data, cargos})
        setLoading(false)
    }, [])
    
    return <FullScreenLoadingOverlay
        loading={loading}
    >
        {error ? <>
            <ErrorOverlay>
                <div className="text-neutral-400 mb-1">
                    An error occurred when search for Extensions
                </div>
                <Link to="/start">
                    <Button>
                        Back to Home
                    </Button>
                </Link>
            </ErrorOverlay>
        </> : <>
            <div className="fixed z-0 w-screen h-screen overflow-clip">
                <div className="w-full">
                    <div className="ml-2">
                        <Tooltip title="Back">
                            <Link to="/start">
                                <IconButton size="large">
                                    <span className="text-xl">
                                        <FontAwesomeIcon 
                                            icon={faArrowLeft}
                                        />
                                    </span>
                                </IconButton>
                            </Link>
                        </Tooltip>
                    </div>
                </div>
                <div className="w-full flex flex-wrap p-4 sm:p-8 lg:p-10">
                    {cargoIndex.cargos.map((cargo, index) => {
                        const {logoUrl, requestRootUrl, name, id} = cargo
                        const isAddonManager = id === ADD_ON_MANAGER_EXTENSION_ID 
                        return <div
                            key={`extension-${index}`}
                            className="mr-5 sm:mr-8"
                            
                        >
                            <Link to={isAddonManager ? "/add-ons" : `/extension?id=${id}`}>
                                <button className="text-neutral-300 hover:text-blue-500">
                                    <div className="mb-3">
                                        <CargoIcon 
                                            pixels={80}
                                            importUrl={requestRootUrl}
                                            crateLogoUrl={logoUrl}
                                            className="hover:shadow-2xl"
                                            customIcon={isAddonManager ? <div
                                                className="text-green-500 mb-1 ml-1"
                                            >
                                                <FontAwesomeIcon 
                                                    icon={faPuzzlePiece}
                                                />
                                            </div> : null}
                                        />
                                    </div>
                                    <Tooltip title={`Run ${name}`} placement="top">
                                        <div 
                                            className="text-center h-16 overflow-clip text-ellipsis"
                                            style={{maxWidth: "80px"}}
                                        >
                                            {name}
                                        </div>
                                    </Tooltip>
                                </button>
                            </Link>
                        </div>
                    })}
                </div>
            </div>
        </>}
    </FullScreenLoadingOverlay>
}

export default ExtensionsListPage