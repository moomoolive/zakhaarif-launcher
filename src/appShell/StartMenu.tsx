import {Button} from "@mui/material"
import {useNavigate} from "react-router-dom"

const StartMenu = () => {
    const navigate = useNavigate()

    return <>
        <div className="relative text-center z-0 w-screen h-screen flex justify-center items-center">
            <div className="relative">
                <div>
                    <Button
                        color="info"
                        onClick={() => navigate("/game")}
                    >
                        Start Game
                    </Button>
                </div>
                <div>
                    <Button
                        color="info"
                        onClick={() => navigate("/add-ons")}
                    >
                        {"Add-ons"}
                    </Button>
                </div>
            </div>
        </div>
    </>
}

export default StartMenu