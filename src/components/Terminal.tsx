import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {Collapse, Tooltip} from "@mui/material"
import {useState, useEffect, ChangeEvent, useRef} from "react"
import {
    TerminalEngine, 
    TerminalMsg,
    CommandsList,
    ValidInputType
} from "@/lib/terminalEngine/index"
import {faTerminal, faGhost, faTimes, faKeyboard, faQuestionCircle} from "@fortawesome/free-solid-svg-icons"
import {useDebounce} from "@/hooks/debounce"
import terminalLoadingElement from "@/components/loadingElements/terminal"

const getTerminalOutput = () => document.getElementById("terminal-prompt")

const terminalFocus = () => {
    const promptElement = getTerminalOutput()
    if (!promptElement) {
        return
    }
    promptElement.focus()
}

type IntellisensePrediction = {
    name: string, 
    source: string
    category: "command" | "option"
    dataType: ValidInputType | "none"
    commandIndex: number
}

const inputToKeyValuePairs = (input: string) => {
    const cleaned = input.trim()

    const tokens = []
    let quotesOpen = false
    let equalOpen = false
    let tokenStart = 0
    let tokenEnd = 0
    for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i]
        const lastCharacter = i >= cleaned.length - 1
        if (char === " " && !quotesOpen) {
            tokens.push(
                cleaned.slice(tokenStart, tokenEnd)
            )
            equalOpen = false
            let foundNextToken = false
            // skip all spaces in between words
            for (let x = i + 1; x < cleaned.length; x++) {
                const innerChar = cleaned[x]
                if (innerChar !== " ") {
                    const nextStart = x
                    i = nextStart
                    tokenStart = nextStart
                    tokenEnd = nextStart
                    foundNextToken = true
                    break
                }
            }
            if (!foundNextToken) {
                i = cleaned.length - 1
            }
        } else if (
            (lastCharacter && !quotesOpen)
            || (lastCharacter && quotesOpen && char === '"')
        ) {
            tokens.push(cleaned.slice(tokenStart))
        } else if (lastCharacter && quotesOpen) {
            continue
        } else if (char === "=" && !equalOpen) {
            equalOpen = true
        } else if (char === "=" && equalOpen && !quotesOpen) {
            let firstEqual = 0
            for (let x = 0; x < cleaned.length; x++) {
                if (cleaned[x] === "=") {
                    firstEqual = x
                    break
                }
            }
            continue
        } else if (char === '"' && !equalOpen) {
            continue
        } else if (char === '"' && !quotesOpen) {
            quotesOpen = true
        } else if (
            quotesOpen 
            && char === '"'
            && i > 0
            && cleaned[i - 1] !== "\\"
        ) {
            quotesOpen = false
        }
        tokenEnd++
    }

    const keyValuePairs = []
    for (let x = 0; x < tokens.length; x++) {  
        const token = tokens[x]
        let split = -1
        for (let i = 0; i < token.length; i++) {
            if (token[i] === "=" && i < token.length - 1) {
                split = i
                break
            }
        }
        if (
            split < 0 
            && token.length > 0 
            && token[token.length - 1] === "="
        ) {
            continue
        } else if (split < 0) {
            keyValuePairs.push({key: token, value: ""})
        } else {
            const key = token.slice(0, split)
            const value = token.slice(split + 1)
            keyValuePairs.push({key, value})
        }
    }
    return keyValuePairs
}

const queryForCommand = (query: string, commands: CommandsList) => {
    const predictions = [] as IntellisensePrediction[]
    for (let i = 0; i < commands.length; i++) {
        const command = commands[i]
        const {name, source} = command
        if (name.includes(query) || source.includes(query)) {
            predictions.push({
                name, 
                source, 
                dataType: "none",
                category: "command",
                commandIndex: i
            })
        }
    }
    return predictions
}

const TERMINAL_CLIENT_NAME = "shabah"
const MAX_PREDICTION_HEIGTH = 150

type TerminalCoreProps = {
    engine: TerminalEngine
    onClose: () => void
}

const TerminalCore = ({
    engine,
    onClose
} : TerminalCoreProps) => {
    const intellisenseDebounce = useDebounce(50)
    
    const [user] = useState("root")
    const [currentPath] = useState("~")
    const [machineName] = useState("terminal-std")
    const [promptText, setPromptText] = useState("")
    const [terminalOutput, setTerminalOutput] = useState([] as TerminalMsg[])
    const [showCommandPrompt, setShowCommandPrompt] = useState(true)
    const [showIntellisense, setShowIntellisense] = useState(false)
    const [predicitionIndex, setPredictionIndex] = useState(0)
    const [intellisensePrediction, setIntellisensePredictions] = useState(
        [] as IntellisensePrediction[]
    )
    const {current: terminalCommands} = useRef(
        engine.getAllCommands()
    )
    const {current: windowHooks} = useRef({
        execCommand: async () => {},
        onArrowKey: (inc: number) => {},
        close: () => {},
        onIntellisenseInteract: () => {}
    })
    const {current: commandHistory} = useRef([] as string[])
    const historyCursorRef = useRef(0)
    const {current: historyCursor} = historyCursorRef

    useEffect(() => {
        const fn = async (e: KeyboardEvent) => {
            switch (e.key.toLowerCase()) {
                case "enter":
                    windowHooks.execCommand()
                    break
                case "arrowup":
                    windowHooks.onArrowKey(-1)
                    break
                case "arrowdown":
                    windowHooks.onArrowKey(1)
                    break
                case "`":
                case "escape":
                    windowHooks.close()
                    break
                case "tab":
                    windowHooks.onIntellisenseInteract()
                    break
            }
        }
        window.addEventListener("keyup", fn)
        return () => window.removeEventListener("keyup", fn)
    }, [])

    useEffect(() => {
        engine.setStreamOutput((msg) => {
            const {append, remove, preappend, replace} = TerminalEngine.OUTPUT_TYPES
            setTerminalOutput((allMsgs) => {
                switch (msg.type) {
                    case remove: {
                        if (allMsgs.length < 1) {
                            return allMsgs
                        }
                        const index = allMsgs.findIndex(({id}) => id === msg.id)
                        if (index < 0) {
                            return allMsgs
                        }
                        const copy = [...allMsgs]
                        copy.splice(index, 1)
                        return copy
                    }
                    case append:
                    case preappend:
                    case replace: {
                        if (allMsgs.length < 1) {
                            return allMsgs
                        }
                        const index = allMsgs.findIndex(({id}) => id === msg.id)
                        if (index < 0) {
                            return allMsgs
                        }
                        const copy = [...allMsgs]
                        const target = copy[index]
                        let newText = ""
                        if (msg.type === append) {
                            newText = target.text + msg.text
                        } else if (msg.type === preappend) {
                            newText = msg.text + target.text
                        } else {
                            newText = target.text
                        }
                        copy[index] = {...target, text: newText}
                        return copy
                    }
                    default: {
                        const entry = msg.text === "\n"
                            ? {...msg, text: "<div style='margin-bottom: 1rem;'></div>"}
                            : msg
                        const copy = [...allMsgs, entry]
                        if (copy.length > 19) {
                            copy.shift()
                        }
                        return copy
                    }
                }
            })
        })
        setTerminalOutput([
            TerminalMsg.info(
                "start-msg",
                "<div class='mb-4'>😀 Welcome! Press <span class='bg-gray-600 text-gray-200 shadow rounded px-1 py-0.5'>`</span> to toggle terminal or intellisense. For documentation type <span class='bg-gray-600 text-gray-200 shadow rounded px-1 py-0.5'>help</span> directly after a command.</div>"
            )
        ])
        terminalFocus()
        return () => engine.exit("Closing terminal session. Goodbye.")
    }, [])
    
    const chooseInputPrediction = (index: number) => {
        if (index < 0 || index >= intellisensePrediction.length) {
            return
        }
        const prediction = intellisensePrediction[index]
        const text = promptText.split(" ")
        const predictedText = ((
            type: typeof prediction.dataType,
            fieldName: string
        ) => {
            switch (type) {
                case "float":
                case "float?":
                case "num":
                case "num?":
                case "int":
                case "int?":
                    return `${fieldName}=`
                case "str":
                case "str?":
                    return `${fieldName}=""`
                default:
                    return fieldName
            }
        })(prediction.dataType, prediction.name)
        text[text.length - 1] = predictedText
        const resultText = text.join(" ")
        setPromptText(resultText)
        setShowIntellisense(false)
        terminalFocus()
        // string datatype
        const element = document.getElementById("terminal-prompt")
        if (prediction.dataType.startsWith("str") && element) {
            // set cursor in middle of double quotes
            // after promptText is set
            setTimeout(() => {
                const e = element as HTMLInputElement
                const middleOfDoubleQuotes = resultText.length - 1
                e.selectionStart = middleOfDoubleQuotes
                e.selectionEnd = middleOfDoubleQuotes
            }, 0)
        }
    }

    const chooseCommandPrediction = (index: number) => {
        if (index < 0 || index >= intellisensePrediction.length) {
            return
        }
        setPromptText(
            intellisensePrediction[index].name
        )
        setShowIntellisense(false)
        terminalFocus()
    }

    windowHooks.execCommand = async () => {
        const cmd = promptText
        const prevCommand = commandHistory.at(-1)
        if (prevCommand !== cmd) {
            commandHistory.push(cmd)
        }
        historyCursorRef.current = 0
        const text = promptText
        setPromptText("")
        setShowCommandPrompt(false)
        if (showIntellisense) {
            setShowIntellisense(false)
        }
        await engine.execute(text)
        setShowCommandPrompt(true)
    }

    windowHooks.onArrowKey = (n) => {
        
        const element = document.getElementById("terminal-prompt")
        if (element) {
            const e = element as HTMLInputElement
            e.selectionStart = promptText.length
        }

        if (showIntellisense) {
            const nextPrediction = predicitionIndex + n
            const len = intellisensePrediction.length
            const last = len - 1
            let targetIndex = 0
            if (nextPrediction > last) {
                targetIndex = 0
            } else if (nextPrediction < 0) {
                targetIndex = last
            } else {
                targetIndex = nextPrediction
            }
            setPredictionIndex(targetIndex)
            terminalFocus()
            const predictionContainer = document.getElementById("intellisense-container")
            const chosenPrediction = document.getElementById(`intellisense-prediction-${targetIndex}`)
            if (!predictionContainer || !chosenPrediction) {
                return
            }
            const offsetDifference = (
                predictionContainer.scrollTop
                - chosenPrediction.offsetTop
            )
            if (
                offsetDifference > 0
                || offsetDifference <= - MAX_PREDICTION_HEIGTH - 10
            ) {
                predictionContainer.scrollTop = chosenPrediction.offsetTop
            } else if (offsetDifference <= - MAX_PREDICTION_HEIGTH + 10) {
                predictionContainer.scrollTop += 25
            }
            return
        }

        if (commandHistory.length < 1) {
            return
        }
        const len = commandHistory.length
        const inc = historyCursor + n
        if (inc > 0 || len + inc < 0) {
            return
        } 
        historyCursorRef.current = inc
        if (inc === 0) {
            setPromptText("")
            return
        }
        setPromptText(commandHistory[commandHistory.length + inc])
    }

    windowHooks.close = () => {
        if (showIntellisense) {
            setShowIntellisense(false)
        } else {
            onClose()
        }
    }

    windowHooks.onIntellisenseInteract = () => {
        if (!showIntellisense) {
            const prompt = promptText.trim()
            if (prompt.length > 1) {
                return
            }
            const allCommmands = terminalCommands.map((command, index) => {
                const {name, source} = command
                return {
                    name, 
                    source, 
                    dataType: "none",
                    category: "command",
                    commandIndex: index
                } as const
            })
            setIntellisensePredictions(allCommmands)
            setShowIntellisense(true)
            terminalFocus()
            return
        }
        
        if (intellisensePrediction.length < 1) {
            return
        }

        if (intellisensePrediction[0].category === "option") {
            chooseInputPrediction(predicitionIndex)
        } else {
            chooseCommandPrediction(predicitionIndex)
        }
    }

    const makeIntellisensePredicition = (prompt: string) => {
        setIntellisensePredictions([])
        setShowIntellisense(false)
        intellisenseDebounce(() => {
            const replacedExtraSpaces = prompt.replace(/  +/g, " ")
            const trimmed = replacedExtraSpaces.trim()
            const wordsSplit = trimmed.split(" ")
            const targetCommand = wordsSplit[0]
            const commandIndex = terminalCommands.findIndex((command) => {
                return command.name === targetCommand
            })
            setPredictionIndex(0)
            const commandExists = commandIndex > -1
            const commandAlreadyTyped = wordsSplit.length > 0
            const helpCommand = TerminalEngine.DOCUMENTATION_COMMAND
            if (
                commandAlreadyTyped 
                && commandExists 
                && prompt.endsWith(" ")
            ) {
                const command = terminalCommands[commandIndex]
                const {inputs} = command
                const predictions = [
                    {
                        name: helpCommand,
                        dataType: "bool",
                        category: "option",
                        source: "std",
                        commandIndex
                    } as const
                ] as IntellisensePrediction[]
                const existingInputs = inputToKeyValuePairs(prompt).map(({key}) => key)
                let endOfRequiredArguments = 0
                for (let i = 0; i < inputs.length; i++) {
                    const {name, type} = inputs[i]
                    if (existingInputs.includes(name)) {
                        continue
                    }
                    const prediction = {
                        name,
                        dataType: type,
                        category: "option",
                        source: command.source,
                        commandIndex
                    } as const

                    if (
                        predictions.length < 1
                        || type.endsWith("?") 
                        || type === "bool"
                    ) {
                        predictions.push(prediction)
                        continue
                    }

                    if (predictions.length < 2) {
                        predictions.unshift(prediction)
                        continue
                    }

                    const targetIndex = endOfRequiredArguments + 1
                    const target = predictions[targetIndex]
                    predictions[targetIndex] = prediction
                    predictions.push(target)
                    endOfRequiredArguments++
                }
                if (predictions.length > 0) {
                    setShowIntellisense(true)
                }
                setIntellisensePredictions(predictions)
                return
            }

            if (wordsSplit.length > 1 && commandExists) {
                const latestWord = wordsSplit.at(-1)!
                const firstEqual = latestWord.indexOf("=")
                const tokenIncludesEqual = firstEqual > -1
                if (tokenIncludesEqual) {
                    return
                }
                const command = terminalCommands[commandIndex]
                const {inputs} = command
                const predictions = [] as IntellisensePrediction[]
                const existingInputs = inputToKeyValuePairs(prompt).map(({key}) => key)
                for (let i = 0; i < inputs.length; i++) {
                    const possibleInput = inputs[i]
                    const {name, type} = possibleInput
                    if (
                        name.includes(latestWord) 
                        && !existingInputs.includes(name)
                    ) {
                        predictions.push({
                            name,
                            source: command.source,
                            dataType: type,
                            category: "option",
                            commandIndex: commandIndex
                        })
                    }
                }
                if (
                    helpCommand.includes(latestWord) 
                    && !existingInputs.includes(helpCommand)
                ) {
                    predictions.push({
                        name: helpCommand,
                        dataType: "bool",
                        category: "option",
                        source: "std",
                        commandIndex
                    } as const)
                }
                if (predictions.length > 0) {
                    setShowIntellisense(true)
                }
                setIntellisensePredictions(predictions)
                return
            }

            const predictions = queryForCommand(
                prompt, terminalCommands
            )
            if (predictions.length > 0) {
                setShowIntellisense(true)
            }
            setIntellisensePredictions(predictions)
        })
    }

    const onTerminalType = (e: ChangeEvent<HTMLInputElement>) => {
        e.preventDefault()
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
            className="fixed z-20 p-1 w-screen bottom-0 left-0 text-left"
            style={{background: "rgba(64, 64, 64, 0.7)"}}
        >
            <Collapse in={true}>
                <div onClick={terminalFocus}>
                    <div className="pt-1">
                        <div 
                            className="bg-gray-800 shadow hover:bg-gray-900 py-1 px-3 rounded-t-lg w-1/3 flex items-center justify-center"
                            style={{minWidth: "150px"}}
                        >
                            <div className="w-5/6">
                                <Tooltip
                                    title={`[${TERMINAL_CLIENT_NAME}] ${user}@${machineName}: ${currentPath}`}
                                    placement="top"
                                >
                                    <div>
                                        <span className="mr-2">
                                            <FontAwesomeIcon
                                                icon={faGhost}
                                            />
                                        </span>
                                        {`${user}:${currentPath}`}
                                    </div>
                                </Tooltip>
                            </div>
                            <div 
                                className="w-1/6 text-right"
                            >
                                <button
                                    onClick={onClose}
                                    className="hover:text-red-500"
                                >
                                    <FontAwesomeIcon
                                        icon={faTimes}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                    <div 
                        className="relative flex flex-col-reverse z-10 py-2 overflow-y-scroll"
                        style={{height: window.innerHeight / 2.3}}
                    >
                        {[...terminalOutput].reverse().map((msg, i) => {
                            return <div 
                                key={`terminal-msg-${i}`}
                                className={`${msg.type === TerminalMsg.TYPES.error ? "text-red-500" : ""} ${msg.type === TerminalMsg.TYPES.warn ? "text-yellow-500" : ""}`}
                                dangerouslySetInnerHTML={{
                                    __html: msg.type === TerminalMsg.TYPES.command
                                        ? `<span class="mr-1"><span class="text-green-400">root</span><span class="mx-0.5">:</span><span class="text-blue-500">~/<span>$</span></span></span>${msg.text}`
                                        : msg.text
                                }}
                            />
                        })}
                    </div>
                    <div className="relative z-20 flex items-center justify-center">
                        <div className="relative w-full flex items-center">
                            
                            <div className={`mr-1 ${!showCommandPrompt ? "hidden" : ""}`}>
                                <span className="text-green-400">
                                    {user}
                                </span>
                                <span className="mx-0.5">
                                    {":"}
                                </span>
                                <span className="text-blue-500">
                                    {currentPath}
                                    <span className="animate-pulse">
                                        {"$"}
                                    </span>
                                </span>
                            </div>

                            <div className="relative w-5/6">
                                {showIntellisense && intellisensePrediction.length > 0 ? <>
                                    <div 
                                        className="absolute z-30 overflow-y-scroll py-0.5 bg-gray-800 bottom-6 w-full left-0"
                                        style={{maxHeight: `${MAX_PREDICTION_HEIGTH}px`}}
                                        id="intellisense-container"
                                    >
                                        {intellisensePrediction.map(({
                                            name, source, dataType, category,
                                            commandIndex
                                        }, i) => {
                                            return category === "command" ?
                                                        <div 
                                                            key={`intellisense-${i}`}
                                                            className={`px-2 ${i === predicitionIndex ? "bg-gray-700" : ""} cursor-pointer hover:bg-gray-900`}
                                                            onClick={() => chooseCommandPrediction(i)}
                                                            id={`intellisense-prediction-${i}`}
                                                            data-class="prediction"
                                                        >
                                                            <span className="mr-2 text-xs text-purple-400">
                                                                <FontAwesomeIcon 
                                                                    icon={faTerminal}
                                                                />
                                                            </span>
                                                            {name}
                                                            {i === predicitionIndex ? <>
                                                                <span className="ml-3 text-xs text-gray-400">
                                                                {"[command]"}
                                                                </span>
                                                                <span className="ml-2 text-xs text-gray-400">
                                                                    {`from`}
                                                                    <span className="text-blue-500">
                                                                        {" " + source}
                                                                    </span>
                                                                </span>
                                                                {terminalCommands[commandIndex].inputs.length ? <>
                                                                    <span className="ml-2 text-xs text-yellow-500">
                                                                        {terminalCommands[commandIndex]
                                                                            .inputs
                                                                            .filter((input) => input.type !== "bool" && !input.type.endsWith("?"))
                                                                            .length} required args
                                                                    </span>
                                                                </> : <></>}
                                                            </> : <></>}
                                                            
                                                        </div>
                                                    :
                                                        <div 
                                                            key={`intellisense-${i}`}
                                                            className={`px-2 ${i === predicitionIndex ? "bg-gray-700" : ""} cursor-pointer hover:bg-gray-900`}
                                                            onClick={() => chooseInputPrediction(i)}
                                                            id={`intellisense-prediction-${i}`}
                                                            data-class="prediction"
                                                        >
                                                            {name === "help" ? <>
                                                                <span className={`mr-2 text-xs text-blue-500`}>
                                                                    
                                                                    <FontAwesomeIcon 
                                                                        icon={faQuestionCircle}
                                                                    />
                                                                </span>
                                                            </> : <>
                                                                <span className={`mr-2 text-xs ${dataType.endsWith("?") || dataType === "bool" ? "text-green-500" : "text-yellow-500"}`}>
                                                                    <FontAwesomeIcon 
                                                                        icon={faKeyboard}
                                                                    />
                                                                </span>
                                                            </>} 
                                                            {name}
                                                            {i === predicitionIndex ? <>
                                                                <span className="ml-3 text-xs text-gray-400">
                                                                {"[argument]"}
                                                                </span>
                                                                <span className="ml-2 text-xs text-gray-400">
                                                                {`${name === "help" ? "std" : terminalCommands[commandIndex].name}.${name}${dataType.endsWith("?") ? "?" : ""}:`}
                                                                </span>
                                                                <span className="ml-2 text-xs text-gray-400">
                                                                    {((type: typeof dataType) => {
                                                                        switch (type) {
                                                                            case "int?":
                                                                            case "int":
                                                                            case "float":
                                                                            case "float?":
                                                                            case "num":
                                                                            case "num?":
                                                                                return "number"
                                                                            case "bool":
                                                                                return "boolean"
                                                                            case "str":
                                                                            case "str?":
                                                                                return "string"
                                                                            default:
                                                                                return type
                                                                        }
                                                                    })(dataType)}
                                                                    {dataType.startsWith("float") || dataType.startsWith("int") ? ` (${dataType.replace("?", "")})` : ""}
                                                                    {dataType.endsWith("?") || dataType === "bool" ? " | undefined" : ""}
                                                                </span>
                                                                <span className={`ml-2 text-xs ${dataType.endsWith("?") || dataType === "bool" ? "text-green-500" : "text-yellow-500"}`}>
                                                                    {dataType.endsWith("?") || dataType === "bool" ? "optional" : "required"}        
                                                                </span>
                                                            </> : <></>}
                                                            
                                                        </div>
                                                    })}
                                                </div>
                                        </> : <></>}

                                <input 
                                    id="terminal-prompt"
                                    value={promptText}
                                    onChange={onTerminalType}
                                    autoComplete="off"
                                    spellCheck={false}
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

type TerminalProps = (Omit<TerminalCoreProps, "engine"> & {
    engine: TerminalEngine | null
})

export const Terminal = (props: TerminalProps) => {
    const {engine} = props
    if (!engine) {
        return terminalLoadingElement
    }
    return <TerminalCore {...props} engine={engine}/>
}
