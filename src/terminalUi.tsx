import {Collapse} from "@mui/material"
import {useState, useEffect, ChangeEvent} from "react"
import {TerminalEngine, TerminalMsg} from "../terminalEngine/index"
 
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
    incrementHistoryCursor: (inc: number) => {}
}

export const TerminalUi = () => {
    const [promptText, setPromptText] = useState("")
    const [commandHistory, setCommandHistory] = useState([] as string[])
    const [historyCursor, setHistoryCursor] = useState(0)
    const [terminalOutput, setTerminalOutput] = useState([] as TerminalMsg[])
    const [terminal] = useState(new TerminalEngine({
        onStreamOutput: (msg) => {
            setTerminalOutput((out) => {
                const copy = [...out, msg]
                if (copy.length > 19) {
                    copy.shift()
                }
                return copy
            })
        }
    }))

    useEffect(() => {
        terminalFocus()
        return () => {
            if (!getTerminalOutput()) {
                terminal.exit("Closing terminal session. Goodbye.")
            }
        }
    }, [])

    useEffect(() => {
        terminal.addCommandFn("echo", async (output, {raw}) => {
            const [type, ...rest] = raw.split(" ")
            if (type === "-w") {
                output.warn(rest.join(" "))
            } else if (type === "-e") {
                output.error(rest.join(" "))
            } else {
                output.info(raw)
            }
        })
        terminal.addCommandFn("input-test", async (output) => {
            const anwser = await output.input("can you respond with y?")
            output.info(`you responded with "${anwser}"`)
        })

        terminal.addCommandFn("multi-io", async (output) => {
            output.info("step 1")
            await new Promise(res => setTimeout(res, 1_000))
            output.info("step 2")
        })
    }, [])

    terminalState.execCommand = async () => {
        const cmd = promptText
        setCommandHistory((prev) => [...prev, cmd])
        setHistoryCursor(0)
        const text = promptText
        setPromptText("")
        await terminal.exec(text)
    }

    terminalState.incrementHistoryCursor = (n) => {
        if (commandHistory.length < 1) {
            return
        }
        const len = commandHistory.length
        const inc = historyCursor + n
        if (inc === 0 || inc + len < 0) {
            setHistoryCursor(0)
            setPromptText("")
        } else if (inc > 0) {
            setHistoryCursor(-len)
            setPromptText(commandHistory[0])
        } else {
            setHistoryCursor(inc)
            setPromptText(commandHistory[commandHistory.length + inc])
        }
    }

    useEffect(() => {
        const fn = async (e: KeyboardEvent) => {
            switch (e.key.toLowerCase()) {
                case "enter":
                    terminalState.execCommand()
                    break
                case "arrowup":
                    terminalState.incrementHistoryCursor(1)
                    break
                case "arrowdown":
                    terminalState.incrementHistoryCursor(-1)
                    break
            }
        }
        window.addEventListener("keyup", fn)
        return () => window.removeEventListener("keyup", fn)
    }, [])

    const onTerminalType = (e: ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        if (val.length < 1) {
            return setPromptText("")
        }
        const latestkey = e.target.value.at(-1)
        switch (latestkey) {
            case "`":
                break
            default:
                setPromptText(val)
                break

        }
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
                                    id="terminal-prompt"
                                    value={promptText}
                                    onChange={onTerminalType}
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