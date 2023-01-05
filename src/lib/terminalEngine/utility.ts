import type {CommandInputDefinition, CommandDefinition} from "./index"

export const initCommand = <Input extends CommandInputDefinition>({
    name,
    fn,
    source = "unknown",
    documentation = null,
    inputs = {} as Input
}: CommandDefinition<Input>) => ({
    name, fn, source, documentation, inputs
} as const)