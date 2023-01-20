export type CargoCliConfig = {
    buildDir: string
    ignore?: string[]
    generateMiniCargo?: boolean,
    entry?: string
    version?: string
    name?: string
}