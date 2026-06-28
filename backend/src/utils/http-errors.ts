/**
 * Erros HTTP tipados — emitidos por handlers e capturados pelo errorHandler.
 */

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Requisição inválida', details?: unknown) {
    super(400, message, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Não autenticado') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Sem permissão') {
    super(403, message, 'FORBIDDEN');
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Recurso não encontrado') {
    super(404, message, 'NOT_FOUND');
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflito de estado') {
    super(409, message, 'CONFLICT');
  }
}

export class InternalError extends HttpError {
  constructor(message = 'Erro interno', details?: unknown) {
    super(500, message, 'INTERNAL', details);
  }
}
