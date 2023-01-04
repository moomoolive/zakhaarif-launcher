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
        terminal.addCommand({
            name: "echo", 
            fn: async (cmd, {rawInput}) => {
                cmd.info(rawInput)
            },
        })
        const code = await terminal.execute(`echo hello world`)
        const lastestCommand = state.history.at(-1)
        expect(code).toBe(statusCodes.ok)
        expect(!!lastestCommand).toBe(true)
        expect(lastestCommand?.text).toBe(`hello world`)
        expect(lastestCommand?.type).toBe(TerminalMsg.TYPES.info)
    })

    it("command should always be echoed back to host before execute command", async () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        terminal.addCommand({
            name: "echo", 
            fn: async (cmd, {rawInput}) => {
                cmd.info(rawInput)
            }
        })
        const completeCommand = `echo hello world`
        const code = await terminal.execute(completeCommand)
        const echoedCommand = state.history.at(-2)
        expect(code).toBe(statusCodes.ok)
        expect(!!echoedCommand).toBe(true)
        expect(echoedCommand?.text).toBe(completeCommand)
        expect(echoedCommand?.type).toBe(TerminalMsg.TYPES.command)
    })

    it("terminal should return error code if command not found", async () => {
        const terminal = new TerminalEngine()
        const code = await terminal.execute(`echo "hello world"`)
        expect(code).toBe(statusCodes.notFound)
    })

    it("terminal should return error code if command throws error, and not bubble exception to runtime", async () => {
        const terminal = new TerminalEngine()
        terminal.addCommand({name: "err", fn: async () => {
            throw new Error("error")
        }})
        const code = await terminal.execute(`err`)
        expect(code).toBe(statusCodes.fatalError)
    })

    it("terminal should return error code if synchronous command throws error, and not bubble exception to runtime", async () => {
        const terminal = new TerminalEngine()
        terminal.addCommand({
            name: "err", 
            fn: () => { throw new Error("error") }
        })
        const code = await terminal.execute(`err`)
        expect(code).toBe(statusCodes.fatalError)
    })

    it("should always log back command even if error occurs with command", async () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        terminal.addCommand({name: "echo", fn: async () => {
            throw new Error("err")
        }})
        const command = `echo hello world`
        const code = await terminal.execute(command)
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
        terminal.addCommand({
            name: "echo", 
            fn: async (output) => {
                output.info("first")
                output.info("second")
                output.info("third")
            }
        })
        const code = await terminal.execute(`echo hello world`)
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
        terminal.addCommand({
            name: "echo", 
            fn: async (output) => {
                output.info("first")
                await sleep(10)
                output.info("second")
                output.info("third")
            }
        })
        const [code, code2] = await Promise.all([
            terminal.execute(`echo hello world`),
            terminal.execute(`echo hello world`),
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
        terminal.addCommand({name: "input", fn: async (output) => {
            inputResponseFromCommand = await output.input(inputPrompt)
        }})
        const commandPromise = terminal.execute("input")
        while (true) {
            await sleep(10)
            const inputPrompted = state.history.some(({text}) => text === inputPrompt)
            if (inputPrompted) {
                break
            }
        }
        expect(terminal.isWaitingOnInput()).toBe(true)
        const inputResponse = "y"
        terminal.execute(inputResponse)
        const code = await commandPromise
        expect(code).toBe(statusCodes.ok)
        expect(inputResponseFromCommand).toBe(inputResponse)
    })

    it("responses to input request should always be echoed back to host before requesting program continues", async () => {
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
        const messageAfterInput = "message after input"
        terminal.addCommand({name: "input", fn: async (output) => {
            inputResponseFromCommand = await output.input(inputPrompt)
            output.info(messageAfterInput)
        }})
        const commandPromise = terminal.execute("input")
        while (true) {
            await sleep(10)
            const inputPrompted = state.history.some(({text}) => text === inputPrompt)
            if (inputPrompted) {
                break
            }
        }
        expect(terminal.isWaitingOnInput()).toBe(true)
        const inputResponse = "y"
        terminal.execute(inputResponse)
        const code = await commandPromise
        expect(code).toBe(statusCodes.ok)
        expect(inputResponseFromCommand).toBe(inputResponse)
        expect(state.history.at(-1)?.type).toBe(TerminalMsg.TYPES.info)
        expect(state.history.at(-1)?.text).toBe(messageAfterInput)
        expect(state.history.at(-2)?.type).toBe(TerminalMsg.TYPES.input)
        expect(state.history.at(-2)?.text).toBe(inputResponse)
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
        terminal.addCommand({name: "input", 
            fn: async (output) => {
                inputResponseFromCommand = await output.input(inputPrompt)
            } 
        })

        const commandPromise = terminal.execute("input")
        terminal.exit()
        const code = await commandPromise
        expect(code).toBe(statusCodes.fatalError)
    })
})

describe("terminal commands", () => {
    it("if terminal command name includes spaces, terminal command should not be added", () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        const cmdName = "cool command"
        terminal.addCommand({name: cmdName, fn: () => {}})
        const commandlist = terminal.getAllCommands()
        expect(
            commandlist.findIndex(({name}) => name === cmdName)
        ).toBeLessThan(0)
    })

    it("if terminal command name empty string, terminal command should not be added", () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        const cmdName = ""
        terminal.addCommand({name: cmdName, fn: () => {}})
        const commandlist = terminal.getAllCommands()
        expect(
            commandlist.findIndex(({name}) => name === cmdName)
        ).toBeLessThan(0)
    })

    it("if terminal command name contains an equal sign (=), terminal command should not be added", () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        const cmdName = "cooli="
        terminal.addCommand({name: cmdName, fn: () => {}})
        const commandlist = terminal.getAllCommands()
        expect(
            commandlist.findIndex(({name}) => name === cmdName)
        ).toBeLessThan(0)
    })

    it("if terminal command name contains a double quote (\"), terminal command should not be added", () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        const cmdName = 'cooli"key"'
        terminal.addCommand({name: cmdName, fn: () => {}})
        const commandlist = terminal.getAllCommands()
        expect(
            commandlist.findIndex(({name}) => name === cmdName)
        ).toBeLessThan(0)
    })

    it("if terminal command already exists, attempting to redefine should do nothing", () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        const cmdName = "cool_command"
        let str = ""
        const originalFn = () => {str = "hi"}
        const originalSource = "1"
        terminal.addCommand({name:cmdName, fn: originalFn, source: originalSource})
        const nextFn = async () => {str = "no"}
        terminal.addCommand({name: cmdName, fn: nextFn, source: "2"})
        const commandlist = terminal.getAllCommands()
        const commandIndex = commandlist
            .find(({name}) => name === cmdName)
        expect(!!commandIndex).toBe(true)
        expect(commandIndex?.source).toBe(originalSource)
        terminal.execute(cmdName)
        expect(str).toBe("hi")
    })

    it("terminal commands should be able to be removed", () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        const cmdName = "cool_command"
        let str = ""
        const originalFn = () => {str = "hi"}
        terminal.addCommand({
            name: cmdName, fn: originalFn, source: "1"
        })
        terminal.removeCommand(cmdName)
        const commandlist = terminal.getAllCommands()
        const commandIndex = commandlist
            .find(({name}) => name === cmdName)
        expect(!!commandIndex).toBe(false)
    })
})

import {isValidInputDefinition, parseInput} from "./index"

describe("input definition and parsing", () => {
    it("input definitions that are not an object should be rejected", () => {
        expect(isValidInputDefinition(null)).toBe(false)
        expect(isValidInputDefinition([])).toBe(false)
        expect(isValidInputDefinition(undefined)).toBe(false)
        expect(isValidInputDefinition(true)).toBe(false)
        expect(isValidInputDefinition(false)).toBe(false)
        expect(isValidInputDefinition(0)).toBe(false)
        expect(isValidInputDefinition(2)).toBe(false)
        expect(isValidInputDefinition(Symbol())).toBe(false)
        expect(isValidInputDefinition(1n)).toBe(false)
        expect(isValidInputDefinition("")).toBe(false)
        expect(isValidInputDefinition("yeah")).toBe(false)
    })

    it("input definitions that contain invalid types should be rejected", () => {
        expect(isValidInputDefinition({hi: []})).toBe(false)
        expect(isValidInputDefinition({hi: null})).toBe(false)
        expect(isValidInputDefinition({hi: {}})).toBe(false)
        expect(isValidInputDefinition({hi: 0})).toBe(false)
        expect(isValidInputDefinition({hi: 1})).toBe(false)
        expect(isValidInputDefinition({hi: true})).toBe(false)
        expect(isValidInputDefinition({hi: false})).toBe(false)
        expect(isValidInputDefinition({hi: 1n})).toBe(false)
        expect(isValidInputDefinition({hi: "rand"})).toBe(false)
        expect(isValidInputDefinition({hi: ""})).toBe(false)
        expect(isValidInputDefinition({hi: Symbol()})).toBe(false)
    })

    it("input definitions that contain valid types should be accepted", () => {
        expect(isValidInputDefinition({})).toBe(true)
        expect(isValidInputDefinition({x: "bool"})).toBe(true)
        expect(isValidInputDefinition({x: "int"})).toBe(true)
        expect(isValidInputDefinition({x: "int?"})).toBe(true)
        expect(isValidInputDefinition({x: "float?"})).toBe(true)
        expect(isValidInputDefinition({x: "float"})).toBe(true)
        expect(isValidInputDefinition({x: "num"})).toBe(true)
        expect(isValidInputDefinition({x: "str"})).toBe(true)
        expect(isValidInputDefinition({x: "str", y: "bool"})).toBe(true)
        expect(isValidInputDefinition({x: "str", y: "bool", z: "num"})).toBe(true)
        expect(isValidInputDefinition({x: "str?", y: "bool", z: "num"})).toBe(true)
        expect(isValidInputDefinition({x: "str", y: "bool", z: "num"})).toBe(true)
        expect(isValidInputDefinition({x: "str", y: "bool", z: "num?"})).toBe(true)
        expect(isValidInputDefinition({x: "str?", y: "bool", z: "num?"})).toBe(true)
    })

    it("input definitions that contain fields which include an equal sign (=) should be rejected", () => {
        expect(isValidInputDefinition({"hi=": "bool"})).toBe(false)
        expect(isValidInputDefinition({"yes=no": "bool"})).toBe(false)
    })

    it("input definitions that contain fields which include an double quote (\") should be rejected", () => {
        expect(isValidInputDefinition({'hero"b': "bool"})).toBe(false)
        expect(isValidInputDefinition({'my"cool"key': "bool"})).toBe(false)
    })

    it("input definitions that contain a field called 'help' should be rejected", () => {
        expect(isValidInputDefinition({help: "bool"})).toBe(false)
        expect(isValidInputDefinition({"yes": "bool", help: "num"})).toBe(false)
    })

    it("empty command input string should not result in error from input parser", () => {
        const response = parseInput("", [])
        expect(response.error.length).toBe(0)
        expect(response.state).toStrictEqual({})
    })

    it("providing no definition tokens should not result in error from input parser or change in state", () => {
        const response = parseInput(`port=5050`, [])
        expect(response.error.length).toBe(0)
        expect(response.state).toStrictEqual({})
    })

    it("command input that is all spaces string should not result in error from input parser or change in state", () => {
        const response = parseInput("               ", [])
        expect(response.error.length).toBe(0)
        expect(response.state).toStrictEqual({})
    })

    it("strings not predcended by equal sign should return error", () => {
        const response = parseInput(`"hello world"`, [
            {name: "port", type: "num"}
        ])
        expect(response.error.length).toBeGreaterThan(0)
    })

    it("argument names with equal should return error", () => {
        const response = parseInput(`tex=t="hello world"`, [
            {name: "port", type: "num"}
        ])
        expect(response.error.length).toBeGreaterThan(0)
    })

    it("argument names ending with equal sign and not have a value following it should throw an error", () => {
        const response = parseInput(`text="`, [
            {name: "port", type: "num"}
        ])
        expect(response.error.length).toBeGreaterThan(0)
    })

    it("string argument should be able to be parsed without error", () => {
        const response = parseInput(`text="hello world"`, [
            {name: "text", type: "str"}
        ])
        expect(response.error.length).toBe(0)
        expect(response.state.text).toBe("hello world")
    })

    it("unclosed quoations with string argument should throw error", () => {
        const response = parseInput(`text="hello world`, [
            {name: "text", type: "str"}
        ])
        expect(response.error.length).toBeGreaterThan(0)
    })

    it("specifiying string input without quotes returns error", () => {
        const response = parseInput(`text=hello`, [
            {name: "text", type: "str"}
        ])
        expect(response.error.length).toBeGreaterThan(0)
    })

    it("multiple string arguments can be specified and should not return error", () => {
        const response = parseInput(`text="hello" port="http://localhost:8089" key="hey there bro"`, [
            {name: "text", type: "str"},
            {name: "port", type: "str"},
            {name: "key", type: "str"}
        ])
        expect(response.error.length).toBe(0)
        expect(response.state.text).toBe("hello")
        expect(response.state.port).toBe("http://localhost:8089")
        expect(response.state.key).toBe("hey there bro")
    })

    it("double quotes can be used within double quotes if escape character precedes it", () => {
        const response = parseInput(`text="he said: \"bro\", then i ate"`, [
            {name: "text", type: "str"}
        ])
        expect(response.error.length).toBe(0)
        expect(response.state.text).toBe(`he said: "bro", then i ate`)
    })

    it("optional strings should return empty string if argument not found", () => {
        const response = parseInput(`text2=hey`, [
            {name: "text", type: "str?"}
        ])
        expect(response.error.length).toBe(0)
        expect(response.state.text).toBe("")
    })

    it("optional strings should return argument string if argument found", () => {
        const response = parseInput(`text="hi" text2=hey`, [
            {name: "text", type: "str?"}
        ])
        expect(response.error.length).toBe(0)
        expect(response.state.text).toBe("hi")
    })

    it("error should be throw if required string not found", () => {
        const response = parseInput(`text2="hey"`, [
            {name: "text", type: "str"}
        ])
        expect(response.error.length).toBeGreaterThan(0)
    })

    it("error should be throw if required string not found", () => {
        const response = parseInput(`text2=hey`, [
            {name: "text", type: "str"}
        ])
        expect(response.error.length).toBeGreaterThan(0)
    })

    it("boolean fields should be able to be parsed", () => {
        const response = parseInput(`is_cool`, [
            {name: "is_cool", type: "bool"}
        ])
        expect(response.state.is_cool).toBe(true)
        expect(response.error.length).toBe(0)
    })

    it("booleans can be explicitly labeled with 'false'", () => {
        const response = parseInput(`is_cool=false`, [
            {name: "is_cool", type: "bool"}
        ])
        expect(response.state.is_cool).toBe(false)
        expect(response.error.length).toBe(0)
    })

    it("booleans can be explicitly labeled with 'true'", () => {
        const response = parseInput(`is_cool=true`, [
            {name: "is_cool", type: "bool"}
        ])
        expect(response.state.is_cool).toBe(true)
        expect(response.error.length).toBe(0)
    })

    it("multiple booleans can be parsed", () => {
        const response = parseInput(
            `is_cool=true multi-core eatChips=false`, [
            {name: "is_cool", type: "bool"},
            {name: "multi-core", type: "bool"},
            {name: "eatChips", type: "bool"},
            {name: "portForward", type: "bool"},
        ])
        expect(response.state.is_cool).toBe(true)
        expect(response.state["multi-core"]).toBe(true)
        expect(response.state.eatChips).toBe(false)
        expect(response.state.portForward).toBe(false)
        expect(response.error.length).toBe(0)
    })

    it("labeling a explicitly an string other than true or false should return error", () => {
        const response = parseInput(
            `is_cool=rand`, [
            {name: "is_cool", type: "bool"},
        ])
        expect(response.error.length).toBeGreaterThan(0)
    })

    it("number input should be able to be parsed", () => {
        const response = parseInput(
            `port=4040`, [
            {name: "port", type: "num"},
        ])
        expect(response.state.port).toBe(4040)
        expect(response.error.length).toBe(0)
    })

    it("int input should be able to be parsed, and cast to integer", () => {
        const response = parseInput(
            `port=4040.5`, [
            {name: "port", type: "int"},
        ])
        expect(response.state.port).toBe(4040)
        expect(response.error.length).toBe(0)
    })

    it("float input should be able to be parsed, and cast to float", () => {
        const response = parseInput(
            `port=4040.5`, [
            {name: "port", type: "float"},
        ])
        expect(response.state.port).toBe(4040.5)
        expect(response.error.length).toBe(0)
    })

    it("num is the same as float, and cast to float", () => {
        const response = parseInput(
            `port=4040.5`, [
            {name: "port", type: "num"},
        ])
        expect(response.state.port).toBe(4040.5)
        expect(response.error.length).toBe(0)
    })

    it("if non-number is inputted into number option, an error should be returned", () => {
        const response = parseInput(
            `port=cool`, [
            {name: "port", type: "num"},
        ])
        expect(response.error.length).toBeGreaterThan(0)
    })

    it("missing optional numbers are parsed to NaN", () => {
        const response = parseInput(
            ``, [
            {name: "port", type: "num?"},
        ])
        expect(response.error.length).toBe(0)
        expect(response.state.port).NaN
    })

    it("missing required numbers throw an error", () => {
        const response = parseInput(
            ``, [
            {name: "port", type: "num"},
        ])
        expect(response.error.length).toBeGreaterThan(0)
    })

    it("multiple number can be parsed correctly", () => {
        const response = parseInput(
            `port=222.5 speed=24.8 yeah=27.8`, [
            {name: "port", type: "num"},
            {name: "speed", type: "int"},
            {name: "yeah", type: "float"},
        ])
        expect(response.error.length).toBe(0)
        expect(response.state.port).toBe(222.5)
        expect(response.state.speed).toBe(24)
        expect(response.state.yeah).toBe(27.8)
    })

    it("multiple data types can be mixed togther", () => {
        const response = parseInput(
            `port=8080 origin="https://my-mamas-house.com" server_name="moomooer server" cors`, [
            {name: "port", type: "int"},
            {name: "origin", type: "str"},
            {name: "server_name", type: "str?"},
            {name: "cors", type: "bool"},
            {name: "allow_cookies", type: "bool"},
        ])
        expect(response.error.length).toBe(0)
        expect(response.state.port).toBe(8080)
        expect(response.state.origin).toBe("https://my-mamas-house.com")
        expect(response.state.server_name).toBe("moomooer server")
        expect(response.state.cors).toBe(true)
        expect(response.state.allow_cookies).toBe(false)
    })

    it("inputs not defined with command should be parsed and returned to commmand", () => {
        const {error, undefinedInputs} = parseInput(
            `port=8080 exit_code=20_000 rand="hi" arg yeah="coool \"hi\"""`, [
            {name: "port", type: "int"},
        ])
        expect(error.length).toBe(0)
        expect(undefinedInputs.get("exit_code")).toBe("20_000")
        expect(undefinedInputs.get("rand")).toBe(`"hi"`)
        expect(undefinedInputs.get("arg")).toBe("")
        expect(undefinedInputs.get("yeah")).toBe(`"coool \"hi\"""`)
    })

    it("inputs not defined with command should return parser error if double quotes used incorrectly", () => {
        expect(parseInput(`rand="yeaaaaah`, []).error.length).toBeGreaterThan(0)
        expect(parseInput(`x y "yeah" z `, []).error.length).toBeGreaterThan(0)
    })

    it("inputs not defined with command should return parser error if equal sign used incorrectly", () => {
        expect(parseInput(`x=`, []).error.length).toBeGreaterThan(0)
        expect(parseInput(`myweird=name="value" `, []).error.length).toBeGreaterThan(0)
    })

    it("leading and trailing spaces should be ignored", () => {
        const response = parseInput(
            `   port=222.5 speed=24.8 yeah=27.8    `, [
            {name: "port", type: "num"},
            {name: "speed", type: "int"},
            {name: "yeah", type: "float"},
        ])
        expect(response.error.length).toBe(0)
        expect(response.state.port).toBe(222.5)
        expect(response.state.speed).toBe(24)
        expect(response.state.yeah).toBe(27.8)
    })

    it("spaces between inputs should be ignored", () => {
        const response = parseInput(
            `port=222.5  speed=24.8    yeah=27.8`, [
            {name: "port", type: "num"},
            {name: "speed", type: "int"},
            {name: "yeah", type: "float"},
        ])
        expect(response.error.length).toBe(0)
        expect(response.state.port).toBe(222.5)
        expect(response.state.speed).toBe(24)
        expect(response.state.yeah).toBe(27.8)
    })
})

describe("passing inputs to terminal", () => {
    it("inputs should be passed to terminal if no error occurred", async () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        const mydocs = "my cool docs"
        const cmdName = "cmd"
        terminal.addCommand({
            name: cmdName, 
            fn: (_, {parsedInputs}) => {
                expect(parsedInputs).toStrictEqual({
                    arg1: "my string",
                    num: 10,
                    cors: false
                })
            }, 
            source: "1",
            documentation: () => Promise.resolve(mydocs),
            inputs: {
                arg1: "str",
                cors: "bool",
                num: "int"
            }
        })
        await terminal.execute(`cmd arg1="my string" num=10`)
        expect(
            state.history.some((entry) => entry.type === TerminalMsg.TYPES.error)
        ).toBe(
            false
        )
    })

    it("if input parsing error occurred command should not run and error message should be passed to host", async () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        const mydocs = "my cool docs"
        const cmdName = "cmd"

        const commandOutput = "hello world"
        terminal.addCommand({
            name: cmdName, 
            fn: (output) => {
                output.info(commandOutput)
            }, 
            source: "1",
            documentation: () => Promise.resolve(mydocs),
            inputs: {
                arg1: "str",
                cors: "bool",
                num: "int"
            }
        })
        const code = await terminal.execute(`cmd arg1="my string num=10`)
        expect(code).toBe(TerminalEngine.EXIT_CODES.argumentParsingError)
        expect(
            state.history.at(-1)?.type
        ).toBe(
            TerminalEngine.OUTPUT_TYPES.error
        )
        expect(
            state.history.some((entry) => entry.text === commandOutput)
        ).toBe(false)
    })
})

describe("standard commands", () => {
    it("typing 'help' after a command should stream documentation to host", async () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        const mydocs = "my cool docs"
        const cmdName = "cmd"
        terminal.addCommand({
            name: cmdName, 
            fn: () => {}, 
            source: "1",
            documentation: async () => mydocs
        })
        await terminal.execute(`cmd help`)
        expect(state.history.at(-1)?.text).toBe(mydocs)
    })

    it("typing 'help=true' after a command should stream documentation to host", async () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        const mydocs = "my cool docs"
        const cmdName = "cmd"
        terminal.addCommand({
            name: cmdName, 
            fn: () => {}, 
            source: "1",
            documentation: async () => mydocs
        })
        await terminal.execute(`cmd help=true`)
        expect(state.history.at(-1)?.text).toBe(mydocs)
    })

    it("if doc command fails ioerror should be returned", async () => {
        const state = {
            history: [] as TerminalMsg[]
        }
        const terminal = new TerminalEngine({
            onStreamOutput: (msg) => state.history.push(msg)
        })
        const mydocs = "my cool docs"
        const cmdName = "cmd"
        terminal.addCommand({
            name: cmdName, 
            fn: () => {}, 
            source: "1",
            documentation: async () => {
                throw new Error("hello there")
                return mydocs
            }
        })
        const code = await terminal.execute(`cmd help`)
        expect(code).toBe(TerminalEngine.EXIT_CODES.ioError)
        expect(state.history.at(-1)?.type).toBe(
            TerminalEngine.OUTPUT_TYPES.error
        )
    })
})