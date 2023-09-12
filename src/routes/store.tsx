import {createContext, useContext} from "react"
import type {AppStore} from "../routes/Router"

export const AppShellContext = createContext<AppStore>(
    null as unknown as AppStore
)

export const useAppContext = () => useContext(AppShellContext)