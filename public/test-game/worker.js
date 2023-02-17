console.log("hello from worker...")

self.onmessage = (message) => {
    console.log("worker got message", message.data)
}

export {}