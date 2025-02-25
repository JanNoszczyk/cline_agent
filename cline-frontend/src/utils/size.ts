/**
 * Format a byte size to a human-readable string.
 *
 * @param bytes The size in bytes
 * @returns A human-readable string representation of the size
 */
export function formatSize(bytes?: number): string {
	if (bytes === undefined) {
		return "--kb"
	}

	// Simple implementation of pretty-bytes functionality
	const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]

	if (bytes === 0) return "0 B"

	const i = Math.floor(Math.log(bytes) / Math.log(1024))

	if (i === 0) return `${bytes} ${units[i]}`

	return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
