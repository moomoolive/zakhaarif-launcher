export type CargoCliConfig = {
    buildDir: string
    ignore?: string[]
    generateMiniCargo?: boolean,
    uuid?: string
    entry?: string
    version?: string
    name?: string
}