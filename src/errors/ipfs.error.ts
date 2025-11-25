import { IpfsErrorType, type IpfsErrorCause } from "src/types/ipfs-error.types.js";

// Пользовательская ошибка для IPFS клиента
export default class IpfsError extends Error {
	constructor(
		readonly message: string,
		readonly errorType: IpfsErrorType = IpfsErrorType.UNKNOWN,
		readonly cause?: IpfsErrorCause,
		readonly originalError?: Error | unknown
	) {
		super(message);

		this.name = "IpfsError";

		// Сохраняем оригинальный стек, если есть
		if (this.originalError instanceof Error && this.originalError.stack) {
			this.stack = this.originalError.stack;
		}

		// Убеждаемся, что правильный прототип установлен для корректной работы instanceof
		Object.setPrototypeOf(this, IpfsError.prototype);
	}

	// Преобразует ошибку из Error или unknown в IpfsError
	static fromError(
		error: Error | unknown,
		defaultMessage?: string,
		errorType?: IpfsErrorType
	): IpfsError {
		if (error instanceof IpfsError) {
			return error;
		}

		const type = errorType || IpfsErrorType.UNKNOWN;
		const message =
			defaultMessage ||
			(error instanceof Error ? error.message : String(error)) ||
			"IPFS operation failed";

		return new IpfsError(message, type, { type }, error);
	}

	// Type guard для проверки типа ошибки
	static isValidationError(error: unknown): error is IpfsError {
		return error instanceof IpfsError && error.errorType === IpfsErrorType.VALIDATION;
	}

	static isNetworkError(error: unknown): error is IpfsError {
		return error instanceof IpfsError && error.errorType === IpfsErrorType.NETWORK;
	}

	static isTimeoutError(error: unknown): error is IpfsError {
		return error instanceof IpfsError && error.errorType === IpfsErrorType.TIMEOUT;
	}

	static isNotFoundError(error: unknown): error is IpfsError {
		return error instanceof IpfsError && error.errorType === IpfsErrorType.NOT_FOUND;
	}
}
