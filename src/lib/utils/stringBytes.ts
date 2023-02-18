export function stringBytes(str: string): number {
    return (new TextEncoder().encode(str)).length
}