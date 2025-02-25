/**
 * Format a large number to a more readable format.
 * For example, 1000 becomes 1.0k, 1000000 becomes 1.0m, etc.
 *
 * @param num The number to format
 * @returns The formatted number as a string
 */
export function formatLargeNumber(num: number): string {
	if (num >= 1e9) {
		return (num / 1e9).toFixed(1) + "b"
	}
	if (num >= 1e6) {
		return (num / 1e6).toFixed(1) + "m"
	}
	if (num >= 1e3) {
		return (num / 1e3).toFixed(1) + "k"
	}
	return num.toString()
}
