export const serviceWorkerFunctions = {} as const

export const clientFunctions = {
    getFile: (url: string) => {
        console.info("service worker requesting cache url", url)
        return {
            headers: {
                "content-type": "application/json",
                "content-length": "100"
            },
            body: ""
        }
    }
}