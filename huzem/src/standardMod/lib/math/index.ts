import {Quaternion} from "babylonjs"

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const toRadians = (degrees: number) => degrees * (Math.PI / 180.0)

export const toDegrees = (radians: number) => radians * (180.0 / Math.PI)

/**
 * Checks if two inputted floating values are within
 * plus minus of a given range
 * 
 * @param {number} fp1 first number to compare 
 * @param {number} fp2 second number to compare
 * @param {number} range range of error
 * @returns {boolean}
 */
export const fpEqual = (fp1: number, fp2: number, range: number) => fp1 < fp2 + range && fp1 > fp2 - range

export const createAxisRotation = (
    x: number, y: number, z: number, radians: number 
) => {
    const factor = Math.sin(radians / 2.0)
    const xNew = x * factor
    const yNew = y * factor
    const zNew = z * factor
    const w = Math.cos(radians / 2.0)
    return new Quaternion(xNew, yNew, zNew, w).normalize()
}
