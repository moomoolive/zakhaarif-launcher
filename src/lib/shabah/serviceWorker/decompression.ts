import type {DecompressionStreamConstructor} from "../../types/streams"

export function decompressFile(
    _: string, 
    response: Response,
    DecompressionStream: DecompressionStreamConstructor
): Promise<ArrayBuffer> {
    if (!response.body) {
        return response.arrayBuffer()
    }
    // only supporting gzip right now
    const decompressor = new DecompressionStream("gzip")
    const stream = response.body.pipeThrough(decompressor)
    return new Response(stream).arrayBuffer()
}