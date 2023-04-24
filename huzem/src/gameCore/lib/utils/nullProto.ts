/**
 * This makes classes inherit from "null"
 * rather than "Object".
 * Inheritting from "null" makes objects not have
 * the junk methods that comes with "Object" 
 * (eg. "toString", "\__proto__"),
 * which makes browser console autocomplete much nicer for objects.
 * Yes, it's petty - but I like it.
 * 
 * @example <caption>How to use</caption>
 * class MyClass extends NullPrototype {}
 */
export const NullPrototype = (
    function() {} as unknown as { new<T extends object = object>(): T}
)
NullPrototype.prototype = null

/**
 * Same as "Object.create(null)" but with type generic.
 */
export const nullObject = <T extends object>(): T => Object.create(null)
