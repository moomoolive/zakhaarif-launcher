import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {Collapse} from "@mui/material"
import {useState, useEffect, ChangeEvent} from "react"
import type {
    TerminalEngine, 
    TerminalMsg,
    CommandsList,
} from "@/lib/terminalEngine/index"
import {faTerminal} from "@fortawesome/free-solid-svg-icons"
import {useDebounce} from "@/lib/hooks/index"

const getTerminalOutput = () => document.getElementById("terminal-prompt")

const terminalFocus = () => {
    const promptElement = getTerminalOutput()
    if (!promptElement) {
        return
    }
    promptElement.focus()
}

const terminalState = {
    execCommand: async () => {},
    onArrowKey: (inc: number) => {},
    onBackTick: () => {},
    onTabClick: () => {}
}

const enum time {
    milliseconds_per_second = 1_000,
    seconds_per_minute = 60,
    minutes_per_hour = 60,
    hours_per_day = 24,
    milliseconds_per_day = (
        milliseconds_per_second
        * seconds_per_minute
        * minutes_per_hour
        * hours_per_day
    )
}

const queryForCommand = (query: string, commands: CommandsList) => {
    const predictions = []
    for (let i = 0; i < commands.length; i++) {
        const command = commands[i]
        const {name, source} = command
        if (name.includes(query) || source.includes(query)) {
            predictions.push(command)
        }
    }
    return predictions
}

const Terminal = ({
    engine,
    onClose
} : {
    engine: TerminalEngine
    onClose: () => void
}) => {
    const intellisenseDebounce = useDebounce(50)

    const [promptText, setPromptText] = useState("")
    const [commandHistory, setCommandHistory] = useState([] as string[])
    const [historyCursor, setHistoryCursor] = useState(0)
    const [terminalOutput, setTerminalOutput] = useState([] as TerminalMsg[])
    const [showCommandPrompt, setShowCommandPrompt] = useState(true)

    const [showIntellisense, setShowIntellisense] = useState(false)
    const [predicitionIndex, setPredictionIndex] = useState(0)
    const [intellisensePrediction, setIntellisensePredictions] = useState(
        [] as {name: string, source: string}[]
    )
    const [terminalCommands] = useState(
        engine.getAllCommands()
    )

    const choosePrediction = (index: number) => {
        if (index < 0 || index >= intellisensePrediction.length) {
            return
        }
        setPromptText(
            intellisensePrediction[index].name
        )
        setShowIntellisense(false)
        terminalFocus()
    }

    useEffect(() => {
        engine.setStreamOutput((msg) => {
            setTerminalOutput((out) => {
                const copy = [...out, msg]
                if (copy.length > 19) {
                    copy.shift()
                }
                return copy
            })
        })
        setTerminalOutput([
            {type: "info", text: "😀 Welcome! Press <span style='color: yellow;'>`</span> to toggle terminal and intellisense."},
        ])
        terminalFocus()
        return () => engine.exit("Closing terminal session. Goodbye.")
    }, [])

    terminalState.execCommand = async () => {
        if (showIntellisense) {
            choosePrediction(predicitionIndex)
            return
        }
        const cmd = promptText
        const prevCommand = commandHistory.at(-1)
        if (prevCommand !== cmd) {
            setCommandHistory((prev) => [...prev, cmd])
        }
        setHistoryCursor(0)
        const text = promptText
        setPromptText("")
        setShowCommandPrompt(false)
        await engine.exec(text)
        setShowCommandPrompt(true)
    }

    terminalState.onArrowKey = (n) => {
        if (showIntellisense) {
            const nextPrediction = predicitionIndex + n
            const len = intellisensePrediction.length
            const last = len - 1
            if (nextPrediction > last) {
                setPredictionIndex(0)
            } else if (nextPrediction < 0) {
                setPredictionIndex(last)
            } else {
                setPredictionIndex(nextPrediction)
            }
            terminalFocus()
            return
        }

        if (commandHistory.length < 1) {
            return
        }
        const len = commandHistory.length
        const inc = historyCursor + n
        if (inc > 0 || len + inc < 0) {
            return
        } else if (inc === 0) {
            setHistoryCursor(inc)
            setPromptText("")
            return
        }
        setHistoryCursor(inc)
        setPromptText(commandHistory[commandHistory.length + inc])
    }

    terminalState.onBackTick = () => {
        if (showIntellisense) {
            setShowIntellisense(false)
        } else {
            onClose()
        }
    }

    terminalState.onTabClick = () => {
        if (!showIntellisense) {
            return
        }
        choosePrediction(predicitionIndex)
    }

    useEffect(() => {
        const fn = async (e: KeyboardEvent) => {
            switch (e.key.toLowerCase()) {
                case "enter":
                    terminalState.execCommand()
                    break
                case "arrowup":
                    terminalState.onArrowKey(-1)
                    break
                case "arrowdown":
                    terminalState.onArrowKey(1)
                    break
                case "`":
                    terminalState.onBackTick()
                    break
                case "tab":
                    terminalState.onTabClick()
                    break
            }
        }
        window.addEventListener("keyup", fn)
        return () => window.removeEventListener("keyup", fn)
    }, [])


    const makeIntellisensePredicition = (prompt: string) => {
        setIntellisensePredictions([])
        setShowIntellisense(false)
        intellisenseDebounce(() => {
            const predictions = queryForCommand(
                prompt, terminalCommands
            )
            if (predictions.length > 0) {
                setShowIntellisense(true)
            }
            setPredictionIndex(0)
            setIntellisensePredictions(predictions)
        })
    }

    const onTerminalType = (e: ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        if (val.length < 1) {
            setIntellisensePredictions([])
            setShowIntellisense(false)
            return setPromptText("")
        }
        const latestkey = e.target.value.at(-1)
        if (latestkey === "`") {
            return
        }
        if (!engine.isWaitingOnInput()) {
            makeIntellisensePredicition(val)
        }   
        setPromptText(val)
    }

    return <>
        <div 
            className="fixed z-20 p-2 w-screen bottom-0 left-0 text-left"
            style={{background: "rgba(64, 64, 64, 0.7)"}}
        >
            <Collapse in={true}>
                <div onClick={terminalFocus}>
                    <div 
                        className="relative flex flex-col-reverse z-10 py-2 overflow-y-scroll"
                        style={{height: window.innerHeight / 2.3}}
                    >
                        {[...terminalOutput].reverse().map((msg, i) => {
                            return <div 
                                key={`terminal-msg-${i}`}
                                className={`${msg.type === "error" ? "text-red-500" : ""} ${msg.type === "warn" ? "text-yellow-500" : ""}`}
                                dangerouslySetInnerHTML={{
                                    __html: msg.type === "cmd" 
                                        ? `<span class="mr-1"><span class="text-green-400">root</span>:<span class="text-blue-500">~/<span>$</span></span></span>${msg.text}`
                                        : msg.text
                                }}
                            />
                        })}
                    </div>
                    <div className="relative z-20 flex items-center justify-center">
                        <div className="relative w-full flex items-center">
                            
                            <div className={`mr-1 ${!showCommandPrompt ? "hidden" : ""}`}>
                                <span className="text-green-400">{"root"}</span>
                                {":"}
                                <span className="text-blue-500">
                                    {"~/"}
                                    <span className="animate-pulse">
                                        {"$"}
                                    </span>
                                </span>
                            </div>

                            <div className="relative w-5/6">
                                {showIntellisense && intellisensePrediction.length > 0 ? <>
                                    <div 
                                        className="absolute z-30 py-0.5 bg-gray-800 bottom-6 w-full left-0"
                                    >
                                        {intellisensePrediction.map(({name, source}, i) => <div 
                                            key={`intellisense-${i}`}
                                            className={`px-2 ${i === predicitionIndex ? "bg-gray-700" : ""} cursor-pointer hover:bg-gray-900`}
                                            onClick={() => choosePrediction(i)}
                                        >
                                            <span className="mr-2 text-xs text-purple-400">
                                                <FontAwesomeIcon 
                                                    icon={faTerminal}
                                                />
                                            </span>
                                            {name}
                                            {i === predicitionIndex ? <>
                                                <span className="ml-3 text-xs text-gray-400">
                                                {"(command)"}
                                                </span>
                                                <span className="ml-2 text-xs text-gray-400">
                                                    {`from`}
                                                    <span className="text-blue-500">
                                                        {" " + source}
                                                    </span>
                                                </span>
                                            </> : <></>}
                                            
                                        </div>)}
                                    </div>
                                </> : <></>}

                                <input 
                                    id="terminal-prompt"
                                    value={promptText}
                                    onChange={onTerminalType}
                                    className="w-full bg-transparent outline-none focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </Collapse>
        </div>
    </>
}

export default Terminal