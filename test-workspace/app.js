// Simple JavaScript file to test the Cline extension

/**
 * A function that adds two numbers together
 * @param {number} a - The first number
 * @param {number} b - The second number
 * @returns {number} The sum of a and b
 */
function add(a, b) {
	return a + b
}

/**
 * A function that subtracts one number from another
 * @param {number} a - The number to subtract from
 * @param {number} b - The number to subtract
 * @returns {number} The difference between a and b
 */
function subtract(a, b) {
	return a - b
}

/**
 * A function that multiplies two numbers
 * @param {number} a - The first number
 * @param {number} b - The second number
 * @returns {number} The product of a and b
 */
function multiply(a, b) {
	return a * b
}

/**
 * A function that divides one number by another
 * @param {number} a - The dividend
 * @param {number} b - The divisor
 * @returns {number} The quotient of a and b
 * @throws {Error} If b is 0
 */
function divide(a, b) {
	if (b === 0) {
		throw new Error("Cannot divide by zero")
	}
	return a / b
}

// TODO: Implement a function to calculate the average of an array of numbers

// Example usage
console.log("Addition:", add(5, 3))
console.log("Subtraction:", subtract(10, 4))
console.log("Multiplication:", multiply(6, 7))
console.log("Division:", divide(20, 5))

// Export the functions
module.exports = {
	add,
	subtract,
	multiply,
	divide,
}
