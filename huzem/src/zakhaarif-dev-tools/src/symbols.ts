// read & write permissions
/** Denotes whether something can be mutated or not */
export declare const CanMutate: unique symbol

// related to memory layouts
export declare const MemoryLayout: unique symbol

// related to pointers & references
export declare const ReferenceType: unique symbol
/** Refers to when a piece of heap memory is allow to be aliased */
export declare const CanAlias: unique symbol
export declare const PointerType: unique symbol