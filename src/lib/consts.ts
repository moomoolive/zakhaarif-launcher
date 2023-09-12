import type {MainScriptConfig} from "zakhaarif-dev-tools"

export type ZakhaarifApisField = "yzapis"
export type ExtensionContextId = "extension-context-node"
export type ExtensionContextObject = Omit<
    MainScriptConfig, ("apis" | "rootElement")
>
export type ExtensionRootId = "extension-root"
export type ExtensionFrameId = "extension-frame"

export const bismillah = "بسم الله الرحمن الرحيم"

export const BYTES_PER_KB = 1_024
export const BYTES_PER_MB = BYTES_PER_KB * 1_000
export const BYTES_PER_GB = BYTES_PER_MB * 1_000

// based off tailwind's responsive constants: https://tailwindcss.com/docs/responsive-design
export const SMALL_SCREEN_MINIMUM_WIDTH_PX = 640
export const MEDIUM_SCREEN_MINIMUM_WIDTH_PX = 768
export const LARGE_SCREEN_MINIMUM_WIDTH_PX = 1024
export const XLARGE_SCREEN_MINIMUM_WIDTH_PX = 1280
export const XXLARGE_SCREEN_MINIMUM_WIDTH_PX = 1536

export const MILLISECONDS_PER_SECOND = 1_000 
export const SECONDS_PER_MINUTE = 60 
export const MINUTES_PER_HOUR = 60 
export const HOURS_PER_DAY = 24
export const DAYS_PER_YEAR = 365
export const MILLISECONDS_PER_MINUTE = (
	MILLISECONDS_PER_SECOND
    * SECONDS_PER_MINUTE
)
export const MILLISECONDS_PER_HOUR = (
	MILLISECONDS_PER_MINUTE
    * MINUTES_PER_HOUR
)
export const MILLISECONDS_PER_DAY = (
	MILLISECONDS_PER_HOUR
    * HOURS_PER_DAY
)
export const MILLISECONDS_PER_YEAR = (
	MILLISECONDS_PER_DAY
    * DAYS_PER_YEAR
)

export const LOCAL_STORAGE_KEYS = {
	SAVE_EXISTS: "save-exists",
	PROFILE_NAME: "user-profile-name",
	ALLOW_UNSAFE_PACKAGES: "allow-unsafe-packages",
	APP_LAUNCHED: "app-launched",
	VERBOSE_LAUNCHER_LOGS: "verbose-launcher-logs",
	ASKED_TO_PERSIST: "asked-to-persist"
} as const

export const SEARCH_PARAM_KEYS = {
	ADDONS_VIEWING_CARGO: "canonical_url",
	ADDONS_MODAL: "modal",
	ADDONS_INFO_MODAL: "show_huzma_info",
	ADDONS_UPDATE_MODAL: "show_update",
	ADDONS_INSTALL_MODAL: "show_install",
	ADDONS_RECOVERY_MODAL: "show_recovery",
	ADDONS_VIEWING_FILE_MODAL: "file_overlay",
	ADDONS_VIEWING_DIRECTORY: "dir",
	SETTINGS_TAB: "tab",
	EXTENSION_SHELL_TARGET: "canonical_url",
} as const