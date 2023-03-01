export type DecompressionStreamConstructor = {
    new(encoding: "gzip" | "deflate" | "deflate-raw"): ReadableWritablePair<Uint8Array, Uint8Array> 
}

export type CompressionStreams = {
    DecompressionStream: DecompressionStreamConstructor
}