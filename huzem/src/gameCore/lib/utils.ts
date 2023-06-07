/**
 * This makes classes inherit from "null"
 * rather than "Object".
 * Inheritting from "null" makes objects not have
 * the junk methods that comes with "Object" 
 * (eg. "toString", "\__proto__"),
 * which makes browser console autocomplete much nicer for objects.
 * Yes, it's petty - but I like it. Can only be used in place
 * of `Object.create(null)`.
 * 
 * @example <caption>How to use</caption>
 * class MyClass extends Null {} // inherit from null
 * const obj = new Null() // equal to Object.create(null)
 */
export const Null = (function() {} as unknown as { new<T extends object = object>(): T})
Null.prototype = null

export const EMPTY_OBJECT = {}

export const EMPTY_FUNCTION = () => {}

const propDescriptor = {
	value: <unknown>null,
	configurable: true,
	enumerable: true,
	writable: false,
}

/**
 * Defines a property on an inputted object with optional
 * arguments to specify descriptors. Nearly identical to
 * `Object.defineProperty` but avoids the overhead of making
 * a new object every time an new property is created.
 */
export function defineProp<
    TObj extends object, 
    TValue
>(
	object: Readonly<TObj>, 
	property: string,
	value: TValue,
	enumerable = true,
	writable = false,
	configurable = true,
): TObj {
	propDescriptor.enumerable = enumerable
	propDescriptor.writable = writable
	propDescriptor.configurable = configurable
	propDescriptor.value = value
	Object.defineProperty(object, property, propDescriptor)
	// overwrite here in case property value is a large object
	// which won't be garbage collected if we hang onto the
	// value
	propDescriptor.value = null 
	return object
}

export const not_implemented = () => { throw new Error("block not implemented yet") }