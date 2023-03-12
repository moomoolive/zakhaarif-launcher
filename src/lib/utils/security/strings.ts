export const stringEqualConstantTimeCompare = (
	candidate: string,
	comparedTo: string
): boolean => {
	const candidateLength = candidate.length 
	if (candidateLength < 1) {
		return false
	}
	const candidateLastIndex = candidateLength - 1
	const compareLength = comparedTo.length
	let result = 1
	for (let i = 0; i < compareLength; i++) {
		const compareIndex = Math.min(i, candidateLastIndex)
		// this bit manipulation non-sense is done
		// so that no branching is needed. Why avoid
		// branching here? so that the compare 
		// operation is as close as possible to constant time
		const isSame = candidate[compareIndex] === comparedTo[i]
		// if false casts to 0
		// if true casts to 1
		const casted = Number(isSame)
		result = result & casted
	}
	const sameLength = compareLength === candidateLength
	return Boolean(result) && sameLength
}