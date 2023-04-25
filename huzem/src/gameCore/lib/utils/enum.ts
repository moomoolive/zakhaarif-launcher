export type StatusReport<
    TName extends string = string, 
    TCode extends number = number
> = Readonly<{statusText: TName, status: TCode}>

export type EnumMap<
    T extends ReadonlyArray<readonly [statusText: string, status: number]>
> = {
    readonly [index in keyof T as T[index & number][0]]: (
        StatusReport<T[index][0], T[index][1]>
    )
}

export const defineEnum = <
    const T extends ReadonlyArray<readonly [statusText: string, status: number]>
>(...members: T): EnumMap<T> => {
	const generatedEnum = {} as EnumMap<T>
	for (let i = 0; i < members.length; i++) {
		const [statusText, status] = members[i]
		Object.defineProperty(generatedEnum, statusText, {
			value: {statusText, status},
			configurable: true,
			enumerable: true,
			writable: false
		})
	}
	return generatedEnum
}

export type EnumMember<T extends EnumMap<[]>> = T[keyof T]