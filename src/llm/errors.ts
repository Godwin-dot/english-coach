export class MissingApiKeyError extends Error {
  readonly code = "MISSING_API_KEY";

  constructor(message = "Configurez une clé API LLM dans les paramètres.") {
    super(message);
    this.name = "MissingApiKeyError";
  }
}

export class MissingModelError extends Error {
  readonly code = "MISSING_MODEL";

  constructor() {
    super("Configurez un modèle pour le fournisseur sélectionné.");
    this.name = "MissingModelError";
  }
}

export class LLMProviderError extends Error {
  readonly code = "LLM_PROVIDER_ERROR";
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "LLMProviderError";
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
}
