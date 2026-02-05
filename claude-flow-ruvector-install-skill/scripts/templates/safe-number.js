/**
 * Safe Number Utilities
 * Prevents NaN and Infinity from propagating through calculations
 *
 * Usage:
 *   const { safeNumber, safeDivide, safePercent, clamp } = require('./utils/safe-number');
 *
 * Installation:
 *   Copy this file to: viz/server/utils/safe-number.js
 */

/**
 * Convert a value to a number safely
 * @param {*} val - Value to convert
 * @param {number} [defaultVal=0] - Default value if conversion fails
 * @returns {number} Safe number value
 */
function safeNumber(val, defaultVal = 0) {
  if (val === null || val === undefined) return defaultVal;
  const num = Number(val);
  if (Number.isNaN(num) || !Number.isFinite(num)) return defaultVal;
  return num;
}

/**
 * Safely divide two numbers
 * @param {number} a - Numerator
 * @param {number} b - Denominator
 * @param {number} [defaultVal=0] - Default if division fails
 * @returns {number} Safe division result
 */
function safeDivide(a, b, defaultVal = 0) {
  const numA = safeNumber(a, 0);
  const numB = safeNumber(b, 0);
  if (numB === 0) return defaultVal;
  const result = numA / numB;
  if (Number.isNaN(result) || !Number.isFinite(result)) return defaultVal;
  return result;
}

/**
 * Calculate percentage safely
 * @param {number} part - The part (numerator)
 * @param {number} total - The total (denominator)
 * @param {number} [decimals=1] - Decimal places
 * @returns {number} Percentage (0-100 range)
 */
function safePercent(part, total, decimals = 1) {
  const result = safeDivide(part, total, 0) * 100;
  if (result === 0) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(result * factor) / factor;
}

/**
 * Clamp a value to a range
 * @param {number} val - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
function clamp(val, min, max) {
  const num = safeNumber(val, min);
  const safeMin = safeNumber(min, 0);
  const safeMax = safeNumber(max, 100);
  return Math.min(Math.max(num, safeMin), safeMax);
}

/**
 * Round a number safely
 */
function safeRound(val, decimals = 2) {
  const num = safeNumber(val, 0);
  const factor = Math.pow(10, Math.max(0, Math.floor(decimals)));
  return Math.round(num * factor) / factor;
}

/**
 * Calculate average of an array safely
 */
function safeAverage(arr, defaultVal = 0) {
  if (!Array.isArray(arr) || arr.length === 0) return defaultVal;
  const valid = arr.map(v => safeNumber(v, null)).filter(v => v !== null);
  if (valid.length === 0) return defaultVal;
  return safeDivide(valid.reduce((a, b) => a + b, 0), valid.length, defaultVal);
}

/**
 * Calculate sum of an array safely
 */
function safeSum(arr, defaultVal = 0) {
  if (!Array.isArray(arr) || arr.length === 0) return defaultVal;
  return arr.reduce((sum, val) => sum + safeNumber(val, 0), 0);
}

/**
 * Check if a value is a valid number
 */
function isValidNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

/**
 * Format a number with fallback for display
 */
function formatNumber(val, fallback = '-', decimals = 2) {
  const num = safeNumber(val, null);
  if (num === null || !Number.isFinite(Number(val))) return fallback;
  return safeRound(num, decimals).toString();
}

module.exports = {
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
