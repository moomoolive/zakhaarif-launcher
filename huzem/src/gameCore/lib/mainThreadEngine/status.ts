import {defineEnum, EnumMember} from "../utils/enum"

export const ENGINE_CODES = defineEnum(
	["ok", 0],
	["mod_package_invalid_type", 1_000],
	["mod_init_hook_failed", 1_001],
	["mod_js_state_init_failed", 1_002],
	["mod_before_event_loop_failed", 1_002],
)

export type EngineCode = EnumMember<typeof ENGINE_CODES>