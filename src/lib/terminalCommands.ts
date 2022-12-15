import type {CommandCallback} from "../../terminalEngine/index"
import type {SetStateAction} from "react"

type TerminalDependencies = {
    setShowTerminal: (val: SetStateAction<boolean>) => void
    setShowLauncher: (val: SetStateAction<boolean>) => void
}

export const createCommands = ({
    setShowTerminal,
    setShowLauncher
}: TerminalDependencies) => {
    const commands = [] as {name: string, fn: CommandCallback}[]
    
    commands.push({name: "toggle_launcher", fn: async (output) => {
        const launcherElement = document.getElementById("app-shell-launcher")
        const launcherIsOpen = !!launcherElement
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
    }})

    commands.push({name: "list", fn: (out, {self}) => {
        const allCommands = Object.keys(self.commands)
        const cmdsHtml = allCommands.reduce((total, cmd) => {
          return total + `<div style="margin-right: 1rem;">${cmd}</div>`
        }, "")
        out.info(`<div style="width: 100%;display: flex;flex-wrap: wrap;color: pink;">${cmdsHtml}</div>`)
    }})

    commands.push({name: "exit", fn: (out) => {
        out.info("goodbye")
        setTimeout(() => setShowTerminal(false), 200)
    }})

    return commands
}