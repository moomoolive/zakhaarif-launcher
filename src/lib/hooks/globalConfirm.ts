import {useConfirm, ConfirmOptions} from "material-ui-confirm"

export const useGlobalConfirm = () => {
    const innerConfirm = useConfirm()
    type SelectedProps = Pick<ConfirmOptions, (
        "title" | "description" | "confirmationText"
        | "cancellationText"
    )>
    type ConfirmProps = {
        [key in keyof SelectedProps]?: string
    }
    return async (props: ConfirmProps) => {
        try {
            await innerConfirm(props)
            return true
        } catch {
            return false
        }
    }
}