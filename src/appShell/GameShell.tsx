import {useNavigate} from "react-router-dom"
import {useState} from "react"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import {faSadTear} from "@fortawesome/free-solid-svg-icons"
import {Button} from "@mui/material"

console.log("from game shelll....")

window.onmessage = (msg) => {
    console.log(msg.data)
}

const GameShell = () => {
    const navigate = useNavigate()

    const [error, setError] = useState(false)
    return <div>
        {error ? <>
            <div className="relative text-center z-10 w-screen h-screen flex justify-center items-center">
                <div className="w-full">
                    <div className="mb-5 text-6xl text-yellow-500">
                        <FontAwesomeIcon icon={faSadTear}/>
                    </div>

                    <div className="mb-3">
                        <div className="text-xl text-gray-100 mb-2">
                            {"An error occurred..."}
                        </div>
                        <div className="text-xs text-gray-500">
                            Check dev tools for more info
                        </div>
                    </div>
                    
                    <div>
                        <Button
                            onClick={() => navigate("/start")}
                            size="large"
                        >
                            To Start Menu
                        </Button>
                    </div>
                </div>
            </div>
        </> : <></>}
        
        <iframe 
            id="game-frame"
            className="fixed left-0 top-0 w-screen h-screen z-0"
            src={`${location.origin}/?mode=game&sandbox=std`}
            allowFullScreen
            name="game-frame"
            sandbox="allow-orientation-lock allow-pointer-lock allow-scripts"
        />
    </div>
}

export default GameShell