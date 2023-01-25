import {describe, it, expect} from "vitest"
import {
    cargoIsUpdatable, 
    Cargo, 
    NULL_MANIFEST_VERSION,
    cloneCargo,
    LATEST_CRATE_VERSION, NULL_FIELD
} from "./index"

const entry = "index.js"
const manifest = new Cargo({
    crateVersion: LATEST_CRATE_VERSION,
    version: "0.1.0", 
    name: "test-pkg", 
    entry, 
    files: [{name: entry, bytes: 1_000}]
})

describe("cargo update detection function", () => {
    it("should return true if new package is higher version", () => {
        const oldPkg = manifest
        for (let i = 0; i < 3; i++) {
            const newPkg = cloneCargo(manifest)
            newPkg.version = `0.1.${i + 1}`
            const res = cargoIsUpdatable(newPkg, oldPkg)
            expect(res.updateAvailable).toBe(true)
        }
    })

    it("should return false if new and old packages have null version (0.0.0)", () => {
        const newPkg = cloneCargo(manifest)
        newPkg.version = NULL_MANIFEST_VERSION
        const oldPkg = cloneCargo(manifest)
        oldPkg.version = NULL_MANIFEST_VERSION
        const res = cargoIsUpdatable(newPkg, oldPkg)
        expect(res.updateAvailable).toBe(false)
    })

    it("should return false if new package has null version (0.0.0)", () => {
        const oldPkg = manifest
        const newPkg = cloneCargo(manifest)
        newPkg.version = NULL_MANIFEST_VERSION
        const res = cargoIsUpdatable(newPkg, oldPkg)
        expect(res.updateAvailable).toBe(false)
    })

    it("should return true if old package has null version (0.0.0) and new package is non-null", () => {
        const newPkg = cloneCargo(manifest)
        newPkg.version = "0.1.0"
        const oldPkg = cloneCargo(manifest)
        oldPkg.version = NULL_MANIFEST_VERSION
        const res = cargoIsUpdatable(newPkg, oldPkg)
        expect(res.updateAvailable).toBe(true)
    })

    it("should return false if either new or old package has wrong cargo encoding", () => {
        {
            const oldPkg = manifest
            const newPkg = {}
            const res = cargoIsUpdatable(newPkg, oldPkg)
            expect(res.updateAvailable).toBe(false)
            expect(res.oldManifest.errors.length).toBe(0)
            expect(res.newManifest.errors.length).toBeGreaterThan(0)
        }
        {
            const oldPkg = {}
            const newPkg = manifest
            const res = cargoIsUpdatable(newPkg, oldPkg)
            expect(res.updateAvailable).toBe(false)
            expect(res.oldManifest.errors.length).toBeGreaterThan(0)
            expect(res.newManifest.errors.length).toBe(0)
        }
    })
})

import {diffManifestFiles} from "./index"

describe("manifest file diffing function", () => {
    it("should return 0 additions and deletions new and old manifest are identical if ", () => {
        const oldPkg = manifest
        const newPkg = cloneCargo(manifest)
        const updates = diffManifestFiles(
            newPkg, oldPkg, "url-diff"
        )
        expect(updates.add.length).toBe(0)
        expect(updates.delete.length).toBe(0)
    })

    it("should return more than 0 additions if new cargo has more than one file not found in old cargo", () => {
        const oldPkg = manifest
        const addAssets = [
            {name: "new_asset.js", bytes: 0, invalidation: "default"},
            {name: "new_asset1.js", bytes: 0, invalidation: "default"},
        ] as typeof manifest.files
        const newPkg = cloneCargo(oldPkg)
        newPkg.files.push(...addAssets)
        const updates = diffManifestFiles(
            newPkg, oldPkg, "url-diff"
        )
        expect(updates.add.length).toBe(addAssets.length)
        expect(updates.add).toStrictEqual(addAssets.map(({name, bytes}) => ({
            name, bytes
        })))
        expect(updates.delete.length).toBe(0)
    })

    it("should return all new package files as additions and all old package file as deletions if default strategy is 'purge'", () => {
        const oldPkg = cloneCargo(manifest)
        const addAssets = [
            {name: "new_asset.js", bytes: 0, invalidation: "default"},
            {name: "new_asset1.js", bytes: 0, invalidation: "default"},
        ] as typeof manifest.files
        const newPkg = cloneCargo(oldPkg)
        newPkg.files.push(...addAssets)
        const updates = diffManifestFiles(
            newPkg, oldPkg, "purge"
        )
        expect(updates.add.length).toBe(newPkg.files.length)
        expect(updates.add).toStrictEqual(newPkg.files.map(({name, bytes}) => ({
            name, bytes
        })))
        expect(updates.delete.length).toBe(oldPkg.files.length)
        expect(updates.delete).toStrictEqual(oldPkg.files.map(({name, bytes}) => ({
            name, bytes
        })))
    })

    it("should respect individual file invalidation strategies", () => {
        const oldPkg = cloneCargo(manifest)
        oldPkg.files[0].invalidation = "url-diff"
        const addAssets = [
            {name: "new_asset.js", bytes: 0, invalidation: "default"},
            {name: "new_asset1.js", bytes: 0, invalidation: "default"},
        ] as typeof manifest.files
        const newPkg = cloneCargo(oldPkg)
        newPkg.files.push(...addAssets)
        const updates = diffManifestFiles(
            newPkg, oldPkg, "purge"
        )
        expect(updates.add.length).toBe(newPkg.files.length - 1)
        expect(updates.add).toStrictEqual(newPkg.files.slice(1).map(({name, bytes}) => ({
            name, bytes
        })))
        expect(updates.delete.length).toBe(oldPkg.files.length - 1)
        expect(updates.delete).toStrictEqual(oldPkg.files.slice(1).map(({name, bytes}) => ({
            name, bytes
        })))
    })

    it("should return more than 0 deletions if old cargo has more than one file not found in new cargo", () => {
        const deleteAssets = [
            {name: "delete_asset.js", bytes: 0, invalidation: "default"},
            {name: "delete_asset1.js", bytes: 0, invalidation: "default"},
        ] as typeof manifest.files
        const oldPkg = cloneCargo(manifest)
        oldPkg.files.push(...deleteAssets)
        const addAssets = [
            {name: "new_asset.js", bytes: 0, invalidation: "default"},
            {name: "new_asset1.js", bytes: 0, invalidation: "default"},
        ] as typeof manifest.files
        const newPkg = cloneCargo(manifest)
        newPkg.files.push(...addAssets)
        const updates = diffManifestFiles(
            newPkg, oldPkg, "url-diff"
        )
        expect(updates.add.length).toBe(addAssets.length)
        expect(updates.add).toStrictEqual(addAssets.map(({name, bytes}) => ({
            name, bytes
        })))
        expect(updates.delete.length).toBe(deleteAssets.length)
        expect(updates.delete).toStrictEqual(deleteAssets.map(({name, bytes}) => ({
            name, bytes
        })))
    })
})

import {validateManifest} from "./index"
import {SemVer} from "../smallSemver/index"

describe("manifest validation function", () => {
    it("should return error if inputted cargo is not an object", () => {
        const fail = <T>(val: T) => validateManifest(val)
        expect(fail(null).errors.length).toBeGreaterThan(0)
        expect(fail(undefined).errors.length).toBeGreaterThan(0)
        expect(fail(3).errors.length).toBeGreaterThan(0)
        expect(fail(3n).errors.length).toBeGreaterThan(0)
        expect(fail(true).errors.length).toBeGreaterThan(0)
        expect(fail(false).errors.length).toBeGreaterThan(0)
        expect(fail(Symbol()).errors.length).toBeGreaterThan(0)
        expect(fail([]).errors.length).toBeGreaterThan(0)
    })

    it("should return error if one of required fields is missing", () => {
        const del = <T extends keyof Cargo>(k: T) => {
            const v = cloneCargo(manifest)
            delete v[k]
            return validateManifest(v)
        }
        expect(del("crateVersion").errors.length).toBeGreaterThan(0)
        expect(del("name").errors.length).toBeGreaterThan(0)
        expect(del("version").errors.length).toBeGreaterThan(0)
        expect(del("files").errors.length).toBeGreaterThan(0)
    })

    it("should return error if cargo.crateVersion is not a valid version", () => {
        const m = cloneCargo(manifest)
        m.crateVersion = "random_version" as any
        expect(validateManifest(m).errors.length).toBeGreaterThan(0)
    })

    it("should return error if cargo.version is not a valid semantic version", () => {
        const m = cloneCargo(manifest)
        m.version = "not_a_valid_semver"
        const semverRes = SemVer.fromString(m.version)
        const notValid = semverRes === null
        expect(notValid).toBe(true)
        expect(validateManifest(m).errors.length).toBeGreaterThan(0)
    })

    it("should not return error if cargo.file is an array of strings", () => {
        const m = cloneCargo(manifest)
        {((m.files as any) = m.files.map((file) => file.name))}
        expect(validateManifest(m).errors.length).toBe(0)
    })

    it("should return error if cargo.file is an array of primitives other than strings", () => {
        const injectPrimitive = <T>(primitive: T) => {
            const m = cloneCargo(manifest)
            {((m.files as any) = [primitive])}
            return m
        }
        expect(validateManifest(injectPrimitive(Symbol())).errors.length).toBeGreaterThan(0)
        expect(validateManifest(injectPrimitive([])).errors.length).toBeGreaterThan(0)
        expect(validateManifest(injectPrimitive(null)).errors.length).toBeGreaterThan(0)
        expect(validateManifest(injectPrimitive(0)).errors.length).toBeGreaterThan(0)
        expect(validateManifest(injectPrimitive(1)).errors.length).toBeGreaterThan(0)
        expect(validateManifest(injectPrimitive(true)).errors.length).toBeGreaterThan(0)
        expect(validateManifest(injectPrimitive(false)).errors.length).toBeGreaterThan(0)
        expect(validateManifest(injectPrimitive(1n)).errors.length).toBeGreaterThan(0)
    })

    it("should return error if cargo.file is an object is missing required name field and is not a string", () => {
        const m = cloneCargo(manifest)
        delete ((m.files[0] as any).name)
        expect(validateManifest(m).errors.length).toBeGreaterThan(0)
    })

    it("should return no error is file.bytes is not a number, and place a 0 in it's place instead", () => {
        const m = cloneCargo(manifest)
        const fileCopy = {...m.files[0]}
        m.files[0] = {...fileCopy}
        delete ((m.files[0] as any).bytes)
        expect(validateManifest(m).errors.length).toBe(0)
        expect(validateManifest(m).pkg.files[0].bytes).toBe(0)
        m.files[0] = {...fileCopy}
        {((m.files[0] as any).bytes) = null}
        expect(validateManifest(m).errors.length).toBe(0)
        expect(validateManifest(m).pkg.files[0].bytes).toBe(0)
        m.files[0] = {...fileCopy}
        {((m.files[0] as any).bytes) = "hi"}
        expect(validateManifest(m).errors.length).toBe(0)
        expect(validateManifest(m).pkg.files[0].bytes).toBe(0)
        m.files[0] = {...fileCopy}
        {((m.files[0] as any).bytes) = true}
        expect(validateManifest(m).errors.length).toBe(0)
        expect(validateManifest(m).pkg.files[0].bytes).toBe(0)
        m.files[0] = {...fileCopy}
        {((m.files[0] as any).bytes) = {}}
        expect(validateManifest(m).errors.length).toBe(0)
        expect(validateManifest(m).pkg.files[0].bytes).toBe(0)
        m.files[0] = {...fileCopy}
        {((m.files[0] as any).bytes) = []}
        expect(validateManifest(m).errors.length).toBe(0)
        expect(validateManifest(m).pkg.files[0].bytes).toBe(0)
        m.files[0] = {...fileCopy}
        {((m.files[0] as any).bytes) = Symbol()}
        expect(validateManifest(m).errors.length).toBe(0)
        expect(validateManifest(m).pkg.files[0].bytes).toBe(0)
    })

    it("should return error if cargo.entry is provided but is not the name of one of cargo files", () => {
        const m = cloneCargo(manifest)
        m.entry = "random_file_not_listed.js"
        expect(validateManifest(m).errors.length).toBeGreaterThan(0)        
    })

    it("should not return error if cargo.entry is set to NULL_FIELD or empty string", () => {
        const m = cloneCargo(manifest)
        m.entry = ""
        expect(validateManifest(m).errors.length).toBe(0)
        const empty = cloneCargo(manifest)
        empty.entry = NULL_FIELD
        expect(validateManifest(empty).errors.length).toBe(0)
    })

    it("should return no errors when missing all optional fields", () => {
        expect((() => {
            const value = validateManifest({
                crateVersion: LATEST_CRATE_VERSION,
                version: "0.1.0", 
                name: "test-pkg",
                files: [{name: entry, bytes: 1_000}]
            }).errors
            return value.length
        })()).toBe(0)
    })

    it("should return no errors when missing one optional field", () => {
        const del = <T extends keyof Cargo>(k: T) => {
            const v = cloneCargo(manifest)
            delete v[k]
            return validateManifest(v)
        }
        expect(del("invalidation").errors.length).toBe(0)
        expect(del("description").errors.length).toBe(0)
        expect(del("authors").errors.length).toBe(0)
        expect(del("crateLogoUrl").errors.length).toBe(0)
        expect(del("keywords").errors.length).toBe(0)
        expect(del("license").errors.length).toBe(0)
        expect(del("repo").errors.length).toBe(0)
        expect(del("homepageUrl").errors.length).toBe(0)
    })

    it("non-string keywords should be filtered during validation", () => {
        const m = cloneCargo(manifest)
        m.keywords = [null, 0, Symbol(), {}, [], true] as any
        const res = validateManifest(m)
        expect(res.pkg.keywords.length).toBe(0)
    })

    it("author entries with non string names should be filtered out", () => {
        const m = cloneCargo(manifest)
        m.authors = [
            {name: null} as any,
            {name: 0} as any,
            {name: Symbol()} as any,
            {name: []} as any,
            {name: {}} as any,
            {name: true} as any,
        ]
        const res = validateManifest(m)
        expect(res.pkg.authors.length).toBe(0)
    })

    it("should return error if permissions is not an array of strings or objects", () => {
        const t = <T>(val: T) => {
            const m = cloneCargo(manifest)
            {(m.permissions as any) = [val]}
            return m
        }
        expect(validateManifest(t(1)).errors.length).toBeGreaterThan(0)        
        expect(validateManifest(t(3n)).errors.length).toBeGreaterThan(0)        
        expect(validateManifest(t([])).errors.length).toBeGreaterThan(0)        
        expect(validateManifest(t(null)).errors.length).toBeGreaterThan(0)        
        expect(validateManifest(t(true)).errors.length).toBeGreaterThan(0)        
        expect(validateManifest(t(Symbol())).errors.length).toBeGreaterThan(0)        
        expect(validateManifest(t(() => {})).errors.length).toBeGreaterThan(0)        
    })

    it("should return error if permissions is an array of objects and 'key' property is not a string", () => {
        const t = <T>(val: T) => {
            const m = cloneCargo(manifest)
            {(m.permissions as any) = [val]}
            return m
        }
        expect(validateManifest(t({})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: null})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: 0})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: true})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: 1n})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: {}})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: []})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: Symbol()})).errors.length).toBeGreaterThan(0)
    })

    it("should return error if permissions is an array of objects and 'key' property is not a string", () => {
        const t = <T>(val: T) => {
            const m = cloneCargo(manifest)
            {(m.permissions as any) = [val]}
            return m
        }
        expect(validateManifest(t({})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: null})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: 0})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: true})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: 1n})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: {}})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: []})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: Symbol()})).errors.length).toBeGreaterThan(0)
    })

    it("should return error if permissions is an array of objects and 'value' property is not an array", () => {
        const t = <T>(val: T) => {
            const m = cloneCargo(manifest)
            {(m.permissions as any) = [val]}
            return m
        }
        expect(validateManifest(t({key: "", value: 1})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: "", value: {}})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: "", value: Symbol()})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: "", value: true})).errors.length).toBeGreaterThan(0)
        expect(validateManifest(t({key: "", value: 3n})).errors.length).toBeGreaterThan(0)
    })
})

import {validateMiniCargo} from "./index"

describe("mini-cargo validation function", () => {
    it("should return errors if non-object is provided", () => {
        const v = <T>(val: T) => validateMiniCargo(val)
        expect(v(null).errors.length).toBeGreaterThan(0)
        expect(v(undefined).errors.length).toBeGreaterThan(0)
        expect(v([]).errors.length).toBeGreaterThan(0)
        expect(v(Symbol()).errors.length).toBeGreaterThan(0)
        expect(v(1).errors.length).toBeGreaterThan(0)
        expect(v(true).errors.length).toBeGreaterThan(0)
        expect(v("str").errors.length).toBeGreaterThan(0)
    })

    it("should return errors if version is missing or not a valid semver", () => {
        const v = <T>(val: T) => validateMiniCargo(val)
        expect(v({}).errors.length).toBeGreaterThan(0)
        expect(v({version: "not a semver"}).errors.length).toBeGreaterThan(0)
    })

    it("should return no errors if mini cargo is valid", () => {
        const v = <T>(val: T) => validateMiniCargo(val)
        expect(v({version: "0.1.0"}).errors.length).toBe(0) 
        expect(v({version: "2.0.0"}).errors.length).toBe(0) 
        expect(v({version: "3.0.2"}).errors.length).toBe(0) 
    })
})