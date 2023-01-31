import {createContext, useContext} from "react"
import {TopLevelAppProps} from "../lib/types/globalState"

export const AppShellContext = createContext<TopLevelAppProps>(
    null as unknown as TopLevelAppProps
)

export const useAppShellContext = () => useContext(AppShellContext)