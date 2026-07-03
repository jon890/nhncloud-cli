import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

interface IntegerOptionRange {
  min?: number;
  max?: number;
}

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9]\d*)$/;

function describeRange({ min, max }: IntegerOptionRange): string {
  if (min !== undefined && max !== undefined) return `${min} 이상 ${max} 이하의 정수`;
  if (min !== undefined) return `${min} 이상의 정수`;
  if (max !== undefined) return `${max} 이하의 정수`;
  return "0 이상의 정수";
}

function throwIntegerOptionError(value: string | undefined, flag: string, range: IntegerOptionRange): never {
  throw new NhnCloudCliError(
    `${flag} 는 ${describeRange(range)}여야 합니다 (입력: ${JSON.stringify(value)}).`,
    EXIT_PARAM_ERROR,
  );
}

export function parseIntegerOption(value: string, flag: string, range: IntegerOptionRange): number;
export function parseIntegerOption(value: undefined, flag: string, range: IntegerOptionRange): undefined;
export function parseIntegerOption(
  value: string | undefined,
  flag: string,
  range: IntegerOptionRange,
): number | undefined;
export function parseIntegerOption(value: string | undefined, flag: string, range: IntegerOptionRange): number | undefined {
  if (value === undefined) return undefined;

  const pattern = range.min !== undefined && range.min > 0 ? POSITIVE_INTEGER_PATTERN : NON_NEGATIVE_INTEGER_PATTERN;
  if (!pattern.test(value)) {
    throwIntegerOptionError(value, flag, range);
  }

  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    (range.min !== undefined && parsed < range.min) ||
    (range.max !== undefined && parsed > range.max)
  ) {
    throwIntegerOptionError(value, flag, range);
  }

  return parsed;
}

export function parsePositiveIntegerOption(value: string, flag: string): number;
export function parsePositiveIntegerOption(value: undefined, flag: string): undefined;
export function parsePositiveIntegerOption(value: string | undefined, flag: string): number | undefined;
export function parsePositiveIntegerOption(value: string | undefined, flag: string): number | undefined {
  return parseIntegerOption(value, flag, { min: 1 });
}

export function parseNonNegativeIntegerOption(value: string, flag: string): number;
export function parseNonNegativeIntegerOption(value: undefined, flag: string): undefined;
export function parseNonNegativeIntegerOption(value: string | undefined, flag: string): number | undefined;
export function parseNonNegativeIntegerOption(value: string | undefined, flag: string): number | undefined {
  return parseIntegerOption(value, flag, { min: 0 });
}
