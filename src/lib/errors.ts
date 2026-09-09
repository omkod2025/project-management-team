/**
 * The error codes from spec 01 §7. One code per rule, so a failure at the API
 * boundary names the domain rule it violated rather than leaking a database
 * message to the client.
 */

export const ERROR_STATUS = {
  E_INVALID_DOC: 422,
  E_DOC_CONFLICT: 409,
  E_MAX_DEPTH: 422,
  E_LEVEL_MISMATCH: 422,
  E_RANGE_INVERTED: 422,
  E_FIELD_TYPE_IMMUTABLE: 409,
  E_OPTION_ARCHIVED: 409,
  E_UNKNOWN_FIELD: 422,
  E_STATUS_FIELD_TYPE: 422,
  E_RESERVED_KEY: 422,
  E_FORBIDDEN: 403,
  E_NOT_FOUND: 404,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly detail?: Record<string, unknown>;

  // Written out rather than using constructor parameter properties: those
  // require code generation, and Node's type stripping — which is how the
  // domain tests run without a build step — only erases types.
  constructor(
    code: ErrorCode,
    /** Shown to the user. Name the problem and the recovery, never the SQL. */
    message: string,
    detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.detail = detail;
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }

  toJSON() {
    return { code: this.code, message: this.message, ...(this.detail ?? {}) };
  }
}

export const domainError = (code: ErrorCode, message: string, detail?: Record<string, unknown>) =>
  new DomainError(code, message, detail);
