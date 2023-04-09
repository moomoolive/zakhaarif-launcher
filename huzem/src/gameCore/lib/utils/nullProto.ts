export const NullPrototype = (
    function() {} as unknown as { new<T extends object = object>(): T}
)
NullPrototype.prototype = null