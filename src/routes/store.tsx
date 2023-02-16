import {createContext, useContext} from "react"
import type {AppStore} from "../lib/utils/initAppStore"

export const AppShellContext = createContext<AppStore>(
    null as unknown as AppStore
)

export const useAppContext = () => useContext(AppShellContext)