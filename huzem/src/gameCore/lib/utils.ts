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