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

const fillArr = () => (construct) => {
    const arr = []
    for (let i = 0; i < 1_000_000;i++) {
        arr.push(construct())
    }
    return arr
}

{
    const arr = fillArr()(() => 5)
    await test("normal num", () => {
        for (let i = 0; i < 1_000_000;i++) {
            arr[i] = arr[i] + i
        }
    })
}

{
    const arr = fillArr()(() => new Number(5))
    await test("Boxed num", () => {
        for (let i = 0; i < 1_000_000;i++) {
            arr[i] = arr[i] + i
        }
    })
}

{
    const arr = fillArr()(() => ({val: 5}))
    await test("Object num", () => {
        for (let i = 0; i < 1_000_000;i++) {
            arr[i].val = arr[i].val + i
        }
    })
}

{
    const arr = fillArr()(() => ({val: 5, x: 2, z: 5}))
    await test("Large object num", () => {
        for (let i = 0; i < 1_000_000;i++) {
            arr[i].val = arr[i].val + i
        }
    })
}

{
    const vec3 = {
        add: (struct, adder) => struct + adder
    }
    const arr = fillArr()(() => 5)
    await test("number method", () => {
        for (let i = 0; i < 1_000_000;i++) {
            arr[i] = vec3.add(arr[i], i)
        }
    })
}

{
    const vec3 = {
        x: (struct) => struct,
        _x: (struct, adder) => struct + adder
    }
    const arr = fillArr()(() => 5)
    await test("bit struct", () => {
        for (let i = 0; i < 1_000_000;i++) {
            arr[i] = vec3._x(arr[i], vec3.x(arr[i]) + i)
        }
    })
}

{
    const mask = 63
    const imask = ~63
    const vec3 = {
        x: (struct) => struct & mask,
        _x: (struct, add) => (struct & imask) & add
    }
    const arr = fillArr()(() => 5)
    await test("bit struct compile", () => {
        for (let i = 0; i < 1_000_000;i++) {
            arr[i] = (arr[i] & imask) & ((arr[i] & mask) + (i & mask))
        }
    })
}

{
    const mask = 63
    const imask = ~63
    const vec3 = {
        x: (struct) => struct & mask,
        _x: (struct, add) => (struct & imask) & add
    }
    const arr = fillArr()(() => 5)
    await test("bit struct reader", () => {
        for (let i = 0; i < 1_000_000;i++) {
            arr[i] = vec3._x(arr[i], vec3.x(arr[i]) + vec3.x(i & mask))
            //arr[i] = (arr[i] & imask) & ((arr[i] & mask) + (i & mask))
        }
    })
}

