import { ReactNode, useRef, useEffect } from "react"
import { useAppShellContext } from "../routes/store"

export type PaginatorProps = {
    id: string
    children: ReactNode
    threshold?: number[]
    onPaginate: () => unknown,
    className?: string
}

export const Paginator = ({
    id,
    children,
    onPaginate,
    threshold = [0.8],
    className = ""
}: PaginatorProps): JSX.Element => {
    const {logger} = useAppShellContext()

    const paginatorObserver = useRef<IntersectionObserver | null>(null)

    useEffect(() => {
        if (paginatorObserver.current) {
            return
        }
        const root = document.getElementById(id)
        if (!root) {
            logger.warn("observer couldn't find root element for id =", id)
            return
        }
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) {
                    return
                }
                onPaginate()
            }
        }, {threshold})
        observer.observe(root)
        paginatorObserver.current = observer
        return () => {
            if (!paginatorObserver.current) {
                return
            }
            paginatorObserver.current.disconnect()
            paginatorObserver.current = null
        }
    }, [])
    
    return <div id={id} className={className}>
        {children}
    </div>
}