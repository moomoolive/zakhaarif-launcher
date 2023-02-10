import { ReactNode, useEffect, useState } from "react"

export type FadeInProps = {
    show: boolean
    children: ReactNode
}

const FADE_IN = 1
const FADE_OUT = 2

export const FadeIn = ({children, show}: FadeInProps) => {
    const [innerShow, setInnerShow] = useState(show)
    const [animation, setAnimation] = useState(FADE_IN)
    
    useEffect(() => {
        if (!show) {
            setAnimation(FADE_OUT)
            return    
        }
        setAnimation(FADE_IN)
        setInnerShow(true)
    }, [show])

    if (!innerShow) {
        return <></>
    }

    return <span 
        className={`${animation === FADE_IN ? "animate-fade-in-left" : "animate-fade-out-left animate-shrink-height"}`}
        onAnimationEnd={() => {
            if (animation === FADE_OUT) {
                setInnerShow(false)
            }
        }}
    >
        {children}
    </span>
}