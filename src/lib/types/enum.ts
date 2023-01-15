export type EnumRecord = Readonly<{[key: string]: number}>

export type Enum<T extends EnumRecord> = T[keyof T]