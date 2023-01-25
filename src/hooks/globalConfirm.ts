import {useConfirm, ConfirmOptions} from "material-ui-confirm"

export type ButtonColor = (
    "error" | "primary" | "secondary"
    | "success" | "warning" | "info"
)

export type GlobalConfirmProps = {
    title?: string
    description?: string
    confirmationText?: string
    cancellationText?: string
    confirmButtonColor?: ButtonColor
    cancelButtonColor?: ButtonColor
}

export const useGlobalConfirm = () => {
    const innerConfirm = useConfirm()
    
    return async (props: GlobalConfirmProps) => {
        try {
            const confirmationButtonProps = props.confirmButtonColor 
                ? {color: props.confirmButtonColor}
                : {}
            const cancellationButtonProps = props.cancelButtonColor 
                ? {color: props.cancelButtonColor}
                : {}
            await innerConfirm({
                ...props, 
                cancellationButtonProps,
                confirmationButtonProps
            })
            return true
        } catch {
            return false
        }
    }
}