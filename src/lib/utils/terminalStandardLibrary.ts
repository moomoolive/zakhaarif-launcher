import type {SetStateAction} from "react"
import {initCommand} from "../terminalEngine/utility"

type TerminalDependencies = {
    setShowTerminal: (val: SetStateAction<boolean>) => unknown
    source: string
    setLogState: (silent: boolean) => unknown,
    setServiceWorkerLogState: (silent: boolean) => unknown
}

export const createCommands = (deps: TerminalDependencies) => {
    const {
        setShowTerminal,
        source,
        setLogState,
        setServiceWorkerLogState
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

    /*
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
    */

    const frogger = initCommand({
        name: "frogger",
        fn: (output, {parsedInputs}) => {
            const {verboseAppLogs, verboseServiceWorkerLogs} = parsedInputs
            if (verboseAppLogs === 1) {
                setLogState(false)
                output.info("[🐸 Frogger]: Set app logs to verbose mode.")
            } else if (verboseAppLogs === 0) {
                output.info("[🐸 Frogger]: Set app logs to silent mode.")
                setLogState(true)
            }

            if (verboseServiceWorkerLogs === 1) {
                setServiceWorkerLogState(false)
                output.info("[🐸 Frogger]: Set service worker logs to verbose mode.")
            } else if (verboseServiceWorkerLogs === 0) {
                output.info("[🐸 Frogger]: Set service worker logs to silent mode.")
                setServiceWorkerLogState(true)
            }

            if (isNaN(verboseAppLogs) && isNaN(verboseServiceWorkerLogs)) {
                output.warn("[🐸 Frogger]: No options were entered!")
            }
        },
        inputs: {
            verboseAppLogs: "int?",
            verboseServiceWorkerLogs: "int?"
        },
        documentation: async () => {
            const options = [
                {name: "verboseAppLogs", text: "set to 1 for verbose logs and 0 to silence non-critical logs"},
                {name: "verboseServiceWorkerLogs", text: "set to 1 for verbose logs and 0 to silence non-critical logs"},
            ] as const
            return `
            <div>🐸 Frogger, your neighborhood-friendly logger.</div><br/>

            <div>Options:</div>
            ${options.reduce(
                (total, next) => total + `-<span style="color: green; margin: 0.5rem;">${next.name}:</span> ${next.text}<br/>`,
                ""
            )}
            `.trim()
        }
    })

    return [list, exit, frogger] as const
}