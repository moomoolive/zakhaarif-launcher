// @ts-check
const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

const test = async (name = "", fn = () => {}) => {
    const results = []
    for (let i = 0; i < 100; i++) {
        results.push(0)
    }
    for (let i = 0; i < 100; i++) {
        const start = Date.now()
        fn()
        results[i] = Date.now() - start
    }
    const avgRaw = results.slice(10).reduce((total, run) => total + run, 0) / 90
    const avg = parseFloat(avgRaw.toFixed(2))
    const end = {name, avg, runs: 90}
    console.log(end)
    await sleep(500)
    return end
}

{
    class T {
        constructor() {
            this.x = 0.0
            this.y = 0.0
        }
    }
    await test("constructor", () => {
        let a
        for (let i = 0; i < 1_000_000; i++) {
            a = new T()
            a.x += Math.random()
            a.y += Math.random()
        }
    })
}

{
    class T {
        static new() {
            return new T()
        }

        constructor() {
            this.x = 0.0
            this.y = 0.0
        }
    }

    await test("static method", () => {
        let a
        for (let i = 0; i < 1_000_000; i++) {
            a = T.new()
            a.x += Math.random()
            a.y += Math.random()
        }
    })
}