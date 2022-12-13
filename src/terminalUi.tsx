import {Collapse} from "@mui/material"
import {useState} from "react"

export const TerminalUi = () => {
    const [promptText, setPromptText] = useState("")
    return <>
        <div 
            className="fixed z-20 p-2 w-screen bottom-0 left-0 text-left"
            style={{background: "rgba(64, 64, 64, 0.7)"}}
        >
            <Collapse in={true}>
                <div>
                    <div className="py-2">
                        output
                    </div>
                    <div className="flex items-center justify-center">
                        <div className="w-full">
                            <span className="mr-1">
                                <span className="text-green-400">{"root"}</span>
                                {":"}
                                <span className="text-blue-500">
                                    {"~/"}
                                    <span className="animate-pulse">
                                        {"$"}
                                    </span>
                                </span>
                            </span>
                            <span>
                                <input 
                                    value={promptText}
                                    onChange={(e) => setPromptText(e.target.value)}
                                    className="w-5/6 bg-transparent outline-none focus:outline-none"
                                />
                            </span>
                        </div>
                    </div>
                </div>
            </Collapse>
        </div>
    </>
}