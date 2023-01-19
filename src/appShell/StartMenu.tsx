import {Button} from "@mui/material"
import {Link} from "react-router-dom"
import {useAppShellContext} from "./store"
import {useGlobalConfirm} from "@/hooks/globalConfirm"
import {GAME_EXTENSION_ID} from "../config"

const StartMenuPage = () => {
    const {showLauncher} = useAppShellContext()
    const confirm = useGlobalConfirm()

    return <div 
        className="fixed z-0 w-screen h-screen flex overflow-clip"
    >   
        <div className="flex z-20 items-center justify-start h-full w-full max-w-screen-lg mx-auto">
            <div 
                className="w-3/5 mx-auto sm:mx-0 sm:ml-16 h-full sm:w-60 bg-neutral-900/70 flex items-center justify-center"
            >
                <div className="w-full">
                    {([
                        {text: "Start Game", route: `/extension?id=${GAME_EXTENSION_ID}`, color: "success"},
                        {text: "Add-ons", route: "/add-ons", color: "info"},
                        {text: "Extensions", route: "/extensions-list", color: "info"},
                        {text: "Settings", route: "/settings", color: "info"},
                    ] as const).map((item, index) => {
                        const {route, text, color} = item
                        return <div
                            key={`menu-item-${index}`}
                        >
                            <Link to={route}>
                                <Button 
                                    color={color}
                                    fullWidth 
                                    size="large"
                                >
                                    {text}
                                </Button>
                            </Link>
                        </div>
                    })}

                    <div>
                        <Button 
                            color="warning" 
                            fullWidth 
                            size="large"
                            onClick={() => {
                                showLauncher(true)
                                setTimeout(() => {
                                    history.pushState(null, "Back to Launcher", "/")
                                }, 0)
                            }}
                        >
                            {"Launcher"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    </div>
}

export default StartMenuPage