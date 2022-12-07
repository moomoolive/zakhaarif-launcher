// implementation taken from spec
// https://semver.org/

// numbers start high for backwards compatiblity
// in case I want to add more tags in the beginning
const LOWEST_TAG_VAL = 999
export const prereleaseTags = {
    prealpha: 999,
    alpha: 1_000,
    beta: 1_001,
    rc: 1_002
} as const

type PrereleaseTag = keyof typeof prereleaseTags

export type SemVersionPrerelease = "none" | PrereleaseTag

const isPositiveNumber = (n: number) => !Number.isNaN(n) && n > -1

export const MAX_VERSION_LENGTH = 256

export const NO_BUILD_SPECIFIED = -1

const getSemanticVersion = (version: string, Ver: typeof SemVer) => {
    if (version.length < 1 || version.length > MAX_VERSION_LENGTH) {
        return null
    }
    const versionSplit = version.split("-")
    if (versionSplit.length > 2) {
        return null
    }

    const afterCore = ["none", NO_BUILD_SPECIFIED] as [SemVersionPrerelease, number]
    if (versionSplit.length > 1) {
        const prereleaseAndBuild = versionSplit[1]
        const split = prereleaseAndBuild.split(".")
        if (split.length > 2 || split.length < 0) {
            return null
        }
        const prerelease = split[0]
        const tags = Object.keys(prereleaseTags)
        if (!Object.keys(prereleaseTags).includes(prerelease)) {
            return null
        } else {
            afterCore[0] = prerelease as PrereleaseTag
        }

        if (split.length > 1) {
            const build = split[1]
            const parsedBuild = parseInt(build, 10)
            if (isPositiveNumber(parsedBuild)) {
                afterCore[1] = parsedBuild
            } else if (tags.includes(build)) {
                const b = build as PrereleaseTag
                const tagVal = prereleaseTags[b]
                const tagValToBuild = Math.max(
                    tagVal - LOWEST_TAG_VAL, 0
                )
                afterCore[1] = tagValToBuild
            }
        } else {
            // if no build number specified after
            // prerelease tag, default to build zero
            afterCore[1] = 0
        }
    }
    
    const versionsCore = versionSplit[0]
        .split(".")
        .filter(v => v.length > 0) as [string, string, string]
    if (versionsCore.length !== 3) {
        return null
    }
    const parsedVersions = versionsCore.map(v => parseInt(v, 10))
    const validVersionNumbers = parsedVersions
        .map(v => isPositiveNumber(v))
        .reduce((t, passed) => t && passed, true)
    if (!validVersionNumbers) {
        return null
    }
    return new Ver(
        ...parsedVersions as [number, number, number], 
        ...afterCore
    )
}

const enum compare {
    equal = -1,
    current_higher = 0,
    current_lower = 1
}

export class SemVer {
    static fromString(version: string) {
        return getSemanticVersion(version, SemVer)
    }

    major: number
    minor: number
    patch: number
    prerelease: SemVersionPrerelease
    build: number

    constructor(
        major: number, 
        minor: number,
        patch: number,
        prerelease: SemVersionPrerelease,
        build: number
    ) {
        this.major = major
        this.minor = minor
        this.patch = patch
        this.prerelease = prerelease
        this.build = build
    }

    isPrerelease() {
        return this.prerelease !== "none"
    }

    private compare(candidate: SemVer) {
        const {major, minor, patch, prerelease, build} = candidate 
        if (this.major > major) {
            return compare.current_higher
        } else if (this.major < major) {
            return compare.current_lower
        }

        if (this.minor > minor) {
            return compare.current_higher
        } else if (this.minor < minor) {
            return compare.current_lower
        }

        if (this.patch > patch) {
            return compare.current_higher
        } else if (this.patch < patch) {
            return compare.current_lower
        }

        const currentPrerelease = this.isPrerelease()
        const candidatePrerelease = candidate.isPrerelease()
        if (!currentPrerelease && !candidatePrerelease) {
            return compare.equal
        }

        if (!currentPrerelease && candidatePrerelease) {
            return compare.current_higher
        } else if (currentPrerelease && !candidatePrerelease) {
            return compare.current_lower
        }

        const preTag = prereleaseTags[this.prerelease as PrereleaseTag]
        const comparePreTag = prereleaseTags[prerelease as PrereleaseTag]
        if (preTag > comparePreTag) {
            return compare.current_higher
        } else if (preTag < comparePreTag) {
            return compare.current_lower
        }

        if (this.build > build) {
            return compare.current_higher
        } else if (this.build < build) {
            return compare.current_lower
        }

        return compare.equal
    }

    isGreater(candidate: SemVer) {
        return this.compare(candidate) === compare.current_higher
    }

    isLower(candidate: SemVer) {
        return this.compare(candidate) === compare.current_lower
    }

    isEqual(candidate: SemVer) {
        return this.compare(candidate) === compare.equal
    }
}
