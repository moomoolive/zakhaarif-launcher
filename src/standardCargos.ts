import {MOD_CARGO_TAG, EXTENSION_CARGO_TAG} from "./config"

const urlTransform = (url: string) => url.startsWith("https://") || url.startsWith("http://")
	? url
	: window.origin + url

export const LAUNCHER_CARGO = {
	canonicalUrl: urlTransform(import.meta.env.VITE_APP_LAUNCHER_CARGO_URL), 
	tag: EXTENSION_CARGO_TAG
} as const
export const GAME_EXTENSION_CARGO = {
	canonicalUrl: urlTransform(import.meta.env.VITE_APP_GAME_EXTENSION_CARGO_URL),
	tag: EXTENSION_CARGO_TAG
} as const
export const STANDARD_MOD_CARGO = {
	canonicalUrl: urlTransform(import.meta.env.VITE_APP_STANDARD_MOD_CARGO_URL),
	tag: MOD_CARGO_TAG
}

export const STANDARD_CARGOS = [
	LAUNCHER_CARGO,
	GAME_EXTENSION_CARGO,
	STANDARD_MOD_CARGO
] as const