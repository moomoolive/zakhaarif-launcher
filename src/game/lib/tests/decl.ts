declare module "std:fs" {
    export const readFile: (filename: string) => Promise<Uint8Array>
    export const readFileText: (filename: string) => Promise<string>
    export const readFileStream: (filename: string) => Promise<ReadableStream>
}