/**
 * Regex for identifying mentions in text.
 * This is a simplified version of the VSCode extension's mention regex.
 */
export const mentionRegex =
	/@((?:\/|\w+:\/\/)[^\s]+?|[a-f0-9]{7,40}\b|problems\b|terminal\b|git-changes\b)(?=[.,;:!?]?(?=[\s\r\n]|$))/

/**
 * Global version of the mention regex for finding all matches in a string.
 */
export const mentionRegexGlobal = new RegExp(mentionRegex.source, "g")
