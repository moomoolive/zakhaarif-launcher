import {createNoise2D} from "simplex-noise"
import alea from "alea"

type NoiseGenerator = (x: number, y: number) => number

/**
 * 
 * @param noiseFn 
 * @param {number} x 
 * @param {number} y 
 * @param {number} scale  
 * @param {number} octaves increase detail of terrain, requires integer value
 * @param {number} persistence controls frequency over time
 * @param {number} exponentiation controls the general height of terrain
 * @returns {number}
 */

export const fractionalBMotion = (
	noiseFn: NoiseGenerator,
	x: number,
	y: number,
	scale: number,
	octaves: number,
	persistence: number,
	exponentiation: number,
	lacunarity: number,
) => {
	const xs = x / scale
	const ys = y / scale
	let amplitude = 1.0
	let frequency = 1.0
	let normalization = 0
	let total = 0
	for (let octave = 0; octave < octaves; octave++) {
		total += noiseFn(xs * frequency, ys * frequency) * amplitude
		normalization += amplitude
		amplitude *= persistence
		frequency *= lacunarity
	}
	total /= normalization
	// negative base always returns NaN for some reason. need
	// to cast to positive then add negative sign back
	//return total < 0 ? 
	//    -(Math.abs(total) ** exponentiation)
	//    : total ** exponentiation
	const exp = total < 0 ? 
		-(Math.abs(total) ** exponentiation)
		: total ** exponentiation
	return exp
}

const noise1 = createNoise2D(alea("random")) 

export const moistureNoise = (x: number, z: number) => fractionalBMotion(noise1, x, z, 512.0, 4, 0.5, 4.0, 2.0)
