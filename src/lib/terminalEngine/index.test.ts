import {describe, it, expect} from "vitest"
import {TerminalEngine, TerminalMsg, statusCodes} from "./index"

const sleep = (time: number) => new Promise(res => setTimeout(res, time))

describe("terminal can run synchronous like commands", () => {
    it("last element in history should be latest command", async () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        terminal.addCommandFn("echo", async (cmd, {raw}) => {
            cmd.info(raw)
        })
        const code = await terminal.exec(`echo "hello world"`)
        const lastestCommand = state.history.at(-1)
        expect(code).toBe(statusCodes.ok)
        expect(!!lastestCommand).toBe(true)
        expect(lastestCommand?.text).toBe(`"hello world"`)
        expect(lastestCommand?.type).toBe("info")
    })

    it("terminal should return error code if command not found", async () => {
        const terminal = new TerminalEngine()
        const code = await terminal.exec(`echo "hello world"`)
        expect(code).toBe(statusCodes.notFound)
    })

    it("terminal should return error code if command throws error", async () => {
        const terminal = new TerminalEngine()
        terminal.addCommandFn("err", async () => {
            throw new Error("error")
        })
        const code = await terminal.exec(`err`)
        expect(code).toBe(statusCodes.fatalError)
    })

    it("should always log back command even if error occurs with command", async () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        terminal.addCommandFn("echo", async () => {
            throw new Error("err")
        })
        const command = `echo "hello world"`
        const code = await terminal.exec(command)
        expect(state.history[0].text).toBe(command)
        expect(code).toBe(statusCodes.fatalError)
    })

    it("individual outputs should be streamed to output device and not push all once command ends", async () => {
        const state = {
            streamCount: 0,
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => {
                state.streamCount++
                state.history.push(msg)
            }
        })
        terminal.addCommandFn("echo", async (output) => {
            output.info("first")
            output.info("second")
            output.info("third")
        })
        const code = await terminal.exec(`echo "hello world"`)
        expect(code).toBe(statusCodes.ok)
        const commandEcho = 1
        expect(state.streamCount).toBe(3 + commandEcho)
    })

    it("command should fail if another one is in progress", async () => {
        const state = {
            streamCount: 0,
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => {
                state.streamCount++
                state.history.push(msg)
            }
        })
        terminal.addCommandFn("echo", async (output) => {
            output.info("first")
            await sleep(10)
            output.info("second")
            output.info("third")
        })
        const [code, code2] = await Promise.all([
            terminal.exec(`echo "hello world"`),
            terminal.exec(`echo "hello world"`),
        ])
        expect(code).toBe(statusCodes.ok)
        expect(code2).toBe(statusCodes.commandInProgress)
    })

    it("commands should be able to query for input from output device", async () => {
        const state = {
            streamCount: 0,
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => {
                state.streamCount++
                state.history.push(msg)
            }
        })
        const inputPrompt = "type y or n:"
        let inputResponseFromCommand = ""
        terminal.addCommandFn("input", async (output) => {
            inputResponseFromCommand = await output.input(inputPrompt)
        })
        const commandPromise = terminal.exec("input")
        while (true) {
            await sleep(10)
            const inputPrompted = state.history.some(({text}) => text === inputPrompt)
            if (inputPrompted) {
                break
            }
        }
        expect(terminal.isWaitingOnInput()).toBe(true)
        const inputResponse = "y"
        terminal.exec(inputResponse)
        const code = await commandPromise
        expect(code).toBe(statusCodes.ok)
        expect(inputResponseFromCommand).toBe(inputResponse)
    })

    it("commands that use the input method should be cancelable", async () => {
        const state = {
            streamCount: 0,
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => {
                state.streamCount++
                state.history.push(msg)
            }
        })
        const inputPrompt = "type y or n:"
        let inputResponseFromCommand = ""
        terminal.addCommandFn("input", async (output) => {
            inputResponseFromCommand = await output.input(inputPrompt)
        })

        const commandPromise = terminal.exec("input")
        terminal.exit()
        const code = await commandPromise
        expect(code).toBe(statusCodes.fatalError)
    })
})