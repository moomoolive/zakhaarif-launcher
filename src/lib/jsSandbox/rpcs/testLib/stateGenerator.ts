import {createRpcState} from "../index"
import {SandboxDependencies, RpcPersistentState} from "../state"
import {generatePermissionsSummary, cleanPermissions} from "../../../utils/security/permissionsSummary"
import {PermissionsList, HuzmaManifest} from "huzma"
import {Permissions} from "../../../types/permissions"
import { CACHED } from "../../../shabah/backend"
import type {AppDatabase} from "../../../database/AppDatabase"
import { Shabah } from "../../../shabah/downloadClient"

const mockSandboxDependencies: SandboxDependencies = {
    displayExtensionFrame: () => {},
    minimumLoadTime: 0,
    queryState: "",
    createFatalErrorMessage: () => {},
    confirmExtensionExit: async () => {},
    cargoIndex: {
        tag: 0,
        name: "none",
        logo: "none",
        resolvedUrl: "",
        canonicalUrl: "",
        bytes: 0,
        entry: "",
        version: "0.1.0",
        permissions: [],
        state: CACHED,
        created: 0,
        updated: 0,
        downloadId: "",
        manifestName: ""
    },
    cargo: new HuzmaManifest(),
    // a quick hack for now
    database: {} as unknown as AppDatabase,
    downloadClient: {} as unknown as Shabah,
    recommendedStyleSheetUrl: "",
    origin: "",
    logger: {
        isSilent: () => true,
        info: () => {},
        warn: () => {},
        error: () => {},
    }
}

const mockPersistentState: RpcPersistentState = {
    configuredPermissions: true,
    setEmbedUrls: () => {}
}

const clone = <T extends Object>(object: T) => {
    const clone = {} as Record<string, unknown>
    for (const [key, value] of Object.entries(object)) {
        if (typeof value === "function" || key === "logger") {
            clone[key] = value
            continue
        }
        clone[key] = structuredClone(value)
    }
    return clone as T
}

type DependencyOverwrite = {
    sandboxDependencies?: Partial<SandboxDependencies>,
    persistentState?: Partial<RpcPersistentState>
    permissions?: PermissionsList<Permissions>
}

export const cloneDeps = (
    overwrite: DependencyOverwrite = {}
) => {
    const {
        sandboxDependencies: sDeps, 
        persistentState: pState,
        permissions = []
    } = overwrite
    const cleaned = cleanPermissions(permissions)
    
    const persistentState = {...clone(mockPersistentState), ...pState}
    const sandboxDependencies = {...clone(mockSandboxDependencies), ...sDeps}
    const permissionsSummary = generatePermissionsSummary(cleaned)
    const state = createRpcState(
        sandboxDependencies, 
        persistentState, 
        permissionsSummary
    )
    return {
        state, 
        sandboxDependencies, 
        permissionsSummary, 
        persistentState
    }
}