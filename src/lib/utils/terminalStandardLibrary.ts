import {initCommand} from "@/lib/terminalEngine/index"
import type {SetStateAction} from "react"

type TerminalDependencies = {
    setShowTerminal: (val: SetStateAction<boolean>) => void
    setShowLauncher: (val: SetStateAction<boolean>) => void
    source: string
}

export const createCommands = (deps: TerminalDependencies) => {
    const {
        setShowLauncher, 
        setShowTerminal,
        source
    } = deps

    const toggleLauncher = initCommand({
        name: "toggle_launcher",
        fn: async (output, {parsedInputs}) => {
            const launcherElement = document.getElementById("app-shell-launcher")
            const launcherIsOpen = !!launcherElement
            const {force} = parsedInputs
            if (force) {
                output.info("forcing launcher toggle...")
                return setShowLauncher((current) => !current)
            }
            if (launcherIsOpen) {
                output.info("Would you like to launch app shell?")
            } else {
                output.info("Would you like to destroy app shell?")
            }
            const res = await output.input(`type "y" to confirm or "n" to cancel`)
            const answer = res.trim().toLowerCase()
            if (answer === "n" || answer !== "y") {
                output.warn("Aborting operation...")
                return
            }
            output.info("success. closing now...")
            setShowLauncher((current) => !current)
        },
        documentation: async () => {
            return `use the "force" option to avoid confirmation dialog`
        },
        source,
        inputs: {
            force: "bool"
        }
    })

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

    return [toggleLauncher, list, exit, manyArg] as const
}