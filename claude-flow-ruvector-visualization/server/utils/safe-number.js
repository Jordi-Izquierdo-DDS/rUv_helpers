/**
 * Safe Number Utilities
 * Prevents NaN and Infinity from propagating through calculations
 *
 * Usage:
 *   import { safeNumber, safeDivide, safePercent, clamp } from './utils/safe-number.js';
 *   const value = safeNumber(maybeUndefined, 0);
 *   const ratio = safeDivide(part, total, 0);
 *   const pct = safePercent(completed, total);
 */

/**
 * Convert a value to a number safely
 * @param {*} val - Value to convert
 * @param {number} [defaultVal=0] - Default value if conversion fails
 * @returns {number} Safe number value
 *
 * @example
 * safeNumber(undefined) // 0
 * safeNumber(null, 5)   // 5
 * safeNumber('42')      // 42
 * safeNumber(NaN, 10)   // 10
 * safeNumber(Infinity)  // 0
 */
export function safeNumber(val, defaultVal = 0) {
  if (val === null || val === undefined) {
    return defaultVal;
  }

  const num = Number(val);

  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return defaultVal;
  }

  return num;
}

/**
 * Safely divide two numbers
 * @param {number} a - Numerator
 * @param {number} b - Denominator
 * @param {number} [defaultVal=0] - Default value if division fails (e.g., divide by zero)
 * @returns {number} Safe division result
 *
 * @example
 * safeDivide(10, 2)     // 5
 * safeDivide(10, 0)     // 0
 * safeDivide(10, 0, -1) // -1
 * safeDivide(null, 5)   // 0
 */
export function safeDivide(a, b, defaultVal = 0) {
  const numA = safeNumber(a, 0);
  const numB = safeNumber(b, 0);

  if (numB === 0) {
    return defaultVal;
  }

  const result = numA / numB;

  if (Number.isNaN(result) || !Number.isFinite(result)) {
    return defaultVal;
  }

  return result;
}

/**
 * Calculate percentage safely
 * @param {number} part - The part (numerator)
 * @param {number} total - The total (denominator)
 * @param {number} [decimals=1] - Number of decimal places
 * @returns {number} Percentage as a number (0-100 range)
 *
 * @example
 * safePercent(25, 100)    // 25
 * safePercent(1, 3)       // 33.3
 * safePercent(0, 0)       // 0
 * safePercent(50, 0)      // 0
 */
export function safePercent(part, total, decimals = 1) {
  const result = safeDivide(part, total, 0) * 100;

  if (result === 0) {
    return 0;
  }

  const factor = Math.pow(10, decimals);
  return Math.round(result * factor) / factor;
}

/**
 * Clamp a value to a range
 * @param {number} val - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 *
 * @example
 * clamp(5, 0, 10)   // 5
 * clamp(-5, 0, 10)  // 0
 * clamp(15, 0, 10)  // 10
 * clamp(NaN, 0, 10) // 0 (returns min for invalid input)
 */
export function clamp(val, min, max) {
  const num = safeNumber(val, min);
  const safeMin = safeNumber(min, 0);
  const safeMax = safeNumber(max, 100);

  if (safeMin > safeMax) {
    // Swap if min > max
    return Math.min(Math.max(num, safeMax), safeMin);
  }

  return Math.min(Math.max(num, safeMin), safeMax);
}

/**
 * Round a number to specified decimal places safely
 * @param {number} val - Value to round
 * @param {number} [decimals=2] - Number of decimal places
 * @returns {number} Rounded value
 *
 * @example
 * safeRound(3.14159, 2) // 3.14
 * safeRound(NaN, 2)     // 0
 */
export function safeRound(val, decimals = 2) {
  const num = safeNumber(val, 0);
  const factor = Math.pow(10, Math.max(0, Math.floor(decimals)));
  return Math.round(num * factor) / factor;
}

/**
 * Calculate average of an array safely
 * @param {Array<number>} arr - Array of numbers
 * @param {number} [defaultVal=0] - Default if array is empty or invalid
 * @returns {number} Average value
 *
 * @example
 * safeAverage([1, 2, 3, 4, 5])  // 3
 * safeAverage([])               // 0
 * safeAverage([1, NaN, 3])      // 2 (NaN filtered out)
 */
export function safeAverage(arr, defaultVal = 0) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return defaultVal;
  }

  const validNumbers = arr
    .map(v => {
      const num = safeNumber(v, null);
      return num;
    })
    .filter(v => v !== null);

  if (validNumbers.length === 0) {
    return defaultVal;
  }

  const sum = validNumbers.reduce((a, b) => a + b, 0);
  return safeDivide(sum, validNumbers.length, defaultVal);
}

/**
 * Calculate sum of an array safely
 * @param {Array<number>} arr - Array of numbers
 * @param {number} [defaultVal=0] - Default if array is empty or invalid
 * @returns {number} Sum value
 *
 * @example
 * safeSum([1, 2, 3])      // 6
 * safeSum([1, NaN, 3])    // 4 (NaN filtered)
 * safeSum([])             // 0
 */
export function safeSum(arr, defaultVal = 0) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return defaultVal;
  }

  return arr.reduce((sum, val) => {
    const num = safeNumber(val, 0);
    return sum + num;
  }, 0);
}

/**
 * Check if a value is a valid number (not NaN, not Infinity)
 * @param {*} val - Value to check
 * @returns {boolean} True if valid number
 *
 * @example
 * isValidNumber(42)        // true
 * isValidNumber(NaN)       // false
 * isValidNumber(Infinity)  // false
 * isValidNumber('42')      // false (string, not number type)
 */
export function isValidNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

/**
 * Format a number with fallback for display
 * @param {*} val - Value to format
 * @param {string} [fallback='-'] - Fallback string for invalid values
 * @param {number} [decimals=2] - Number of decimal places
 * @returns {string} Formatted number or fallback
 *
 * @example
 * formatNumber(42.567)      // '42.57'
 * formatNumber(NaN)         // '-'
 * formatNumber(null, 'N/A') // 'N/A'
 */
export function formatNumber(val, fallback = '-', decimals = 2) {
  const num = safeNumber(val, null);

  if (num === null || !Number.isFinite(Number(val))) {
    return fallback;
  }

  return safeRound(num, decimals).toString();
}

// Default export for convenience
export default {
  safeNumber,
  safeDivide,
  safePercent,
  clamp,
  safeRound,
  safeAverage,
  safeSum,
  isValidNumber,
  formatNumber
};
