export const serviceWorkerFunctions = {} as const

export const clientFunctions = {
    getFile: (url: string) => {
        console.info("service worker requesting cache url", url)
        console.log("res", {
            headers: {
                "content-type": "application/json",
                "content-length": "100"
            },
            body: ""
        })
        return
    }
} as const