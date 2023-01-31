import type {SetStateAction} from "react"
import {initCommand} from "../terminalEngine/utility"

type TerminalDependencies = {
    setShowTerminal: (val: SetStateAction<boolean>) => void
    source: string
}

export const createCommands = (deps: TerminalDependencies) => {
    const {
        setShowTerminal,
        source
    } = deps

    const list = initCommand({
        name: "list",
        fn: (output, {allCommands}) => {
            const cmdsHtml = allCommands.reduce((total, {name}) => {
              return total + `<div style="margin-right: 1rem;">${name}</div>`
            }, "")
            output.info(`<div style="width: 100%;display: flex;flex-wrap: wrap;color: pink;">${cmdsHtml}</div>`)
        },
        source
    })

    const exit = initCommand({
        name: "exit",
        fn: (output) => {
            output.info("goodbye")
            setTimeout(() => setShowTerminal(false), 400)
        },
        source
    })

    const manyArg = initCommand({
        name: "server",
        fn: (output, {parsedInputs}) => {
            const {
                cors, disallow_cookies,
                port, host
            } = parsedInputs
            output.info(`starting server @${host || "http://localhost"}:${port || 8080}`)
            if (cors) {
                output.info("cors enabled!")
            }
            if (disallow_cookies) {
                output.warn("cookies are disabled")
            }
        },
        inputs: {
            cors: "bool",
            cookie_expiry: "int?",
            concurrent: "str",
            port: "int?",
            host: "str?",
            disallow_cookies: "bool",
            cool_arg: "bool",
            anotherOne: "int?",
            yeah: "num",
            vec3: "float"
        },
        source
    })

    return [list, exit, manyArg] as const
}