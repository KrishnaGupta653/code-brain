export class CodeBrainError extends Error {
  constructor(
    message: string,
    public code: string = 'UNKNOWN_ERROR',
    public details?: unknown
  ) {
    super(message);
    this.name = 'CodeBrainError';
  }
}

export class ParserError extends CodeBrainError {
  constructor(message: string, details?: unknown) {
    super(message, 'PARSER_ERROR', details);
    this.name = 'ParserError';
  }
}

export class StorageError extends CodeBrainError {
  constructor(message: string, details?: unknown) {
    super(message, 'STORAGE_ERROR', details);
    this.name = 'StorageError';
  }
}

export class QueryError extends CodeBrainError {
  constructor(message: string, details?: unknown) {
    super(message, 'QUERY_ERROR', details);
    this.name = 'QueryError';
  }
}

export class ConfigError extends CodeBrainError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFIG_ERROR', details);
    this.name = 'ConfigError';
  }
}

export class ValidationError extends CodeBrainError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export function isCodeBrainError(error: unknown): error is CodeBrainError {
  return error instanceof CodeBrainError;
}
