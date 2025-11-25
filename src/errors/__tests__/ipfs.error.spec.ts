import IpfsError from "src/errors/ipfs.error";
import { IpfsErrorType } from "src/types/ipfs-error.types";

describe("IpfsError", () => {
	describe("constructor", () => {
		it("должен создать экземпляр IpfsError с сообщением", () => {
			const error = new IpfsError("Test error");

			expect(error).toBeInstanceOf(IpfsError);
			expect(error).toBeInstanceOf(Error);
			expect(error.message).toBe("Test error");
			expect(error.name).toBe("IpfsError");
		});

		it("должен создать экземпляр IpfsError с причиной", () => {
			const cause = new Error("Original error");
			const error = new IpfsError(
				"Test error",
				IpfsErrorType.UNKNOWN,
				{ type: IpfsErrorType.UNKNOWN },
				cause
			);

			expect(error).toBeInstanceOf(IpfsError);
			expect(error.message).toBe("Test error");
			expect(error.originalError).toBe(cause);
		});

		it("должен установить правильное имя ошибки", () => {
			const error = new IpfsError("Test error");

			expect(error.name).toBe("IpfsError");
		});

		it("должен сохранить стек из причины, если она является Error", () => {
			const cause = new Error("Original error");
			const originalStack = cause.stack;
			const error = new IpfsError(
				"Test error",
				IpfsErrorType.UNKNOWN,
				{ type: IpfsErrorType.UNKNOWN },
				cause
			);

			expect(error.stack).toBe(originalStack);
		});

		it("должен корректно работать с instanceof", () => {
			const error = new IpfsError("Test error");

			expect(error instanceof IpfsError).toBe(true);
			expect(error instanceof Error).toBe(true);
		});
	});

	describe("fromError", () => {
		it("должен вернуть тот же экземпляр если передан IpfsError", () => {
			const originalError = new IpfsError("Original error");
			const result = IpfsError.fromError(originalError);

			expect(result).toBe(originalError);
			expect(result.message).toBe("Original error");
		});

		it("должен преобразовать Error в IpfsError", () => {
			const error = new Error("Standard error");
			const result = IpfsError.fromError(error);

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("Standard error");
			expect(result.originalError).toBe(error);
		});

		it("должен использовать defaultMessage для Error без сообщения", () => {
			const error = new Error("");
			const result = IpfsError.fromError(error, "Default message");

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("Default message");
			expect(result.originalError).toBe(error);
		});

		it("должен использовать дефолтное сообщение для Error без сообщения и defaultMessage", () => {
			const error = new Error("");
			const result = IpfsError.fromError(error);

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("IPFS operation failed");
			expect(result.originalError).toBe(error);
		});

		it("должен преобразовать unknown (строка) в IpfsError", () => {
			const unknownError = "String error";
			const result = IpfsError.fromError(unknownError);

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("String error");
			expect(result.originalError).toBe(unknownError);
		});

		it("должен преобразовать unknown (число) в IpfsError", () => {
			const unknownError = 123;
			const result = IpfsError.fromError(unknownError);

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("123");
			expect(result.originalError).toBe(unknownError);
		});

		it("должен преобразовать unknown (null) в IpfsError", () => {
			const unknownError = null;
			const result = IpfsError.fromError(unknownError);

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("null");
			expect(result.originalError).toBe(unknownError);
		});

		it("должен преобразовать unknown (undefined) в IpfsError", () => {
			const unknownError = undefined;
			const result = IpfsError.fromError(unknownError);

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("undefined");
			expect(result.originalError).toBe(unknownError);
		});

		it("должен использовать defaultMessage для unknown", () => {
			const unknownError = null;
			const result = IpfsError.fromError(unknownError, "Custom default message");

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("Custom default message");
			expect(result.originalError).toBe(unknownError);
		});

		it("должен использовать defaultMessage для unknown (строка) вместо String(error)", () => {
			const unknownError = "String error";
			const result = IpfsError.fromError(unknownError, "Custom default message");

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("Custom default message");
			expect(result.originalError).toBe(unknownError);
		});

		it("должен использовать defaultMessage для unknown (число) вместо String(error)", () => {
			const unknownError = 123;
			const result = IpfsError.fromError(unknownError, "Custom default message");

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("Custom default message");
			expect(result.originalError).toBe(unknownError);
		});

		it("должен использовать defaultMessage для unknown (объект) вместо String(error)", () => {
			const unknownError = { code: 500, message: "Server error" };
			const result = IpfsError.fromError(unknownError, "Custom default message");

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("Custom default message");
			expect(result.originalError).toBe(unknownError);
		});

		it("должен использовать defaultMessage для unknown (undefined) вместо дефолтного сообщения", () => {
			const unknownError = undefined;
			const result = IpfsError.fromError(unknownError, "Custom default message");

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("Custom default message");
			expect(result.originalError).toBe(unknownError);
		});

		it("должен преобразовать объект в IpfsError", () => {
			const unknownError = { code: 500, message: "Server error" };
			const result = IpfsError.fromError(unknownError);

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("[object Object]");
			expect(result.originalError).toBe(unknownError);
		});

		it("должен обработать Error с пустым сообщением и использовать defaultMessage", () => {
			const error = new Error();
			const result = IpfsError.fromError(error, "Custom message");

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("Custom message");
			expect(result.originalError).toBe(error);
		});

		it("должен использовать дефолтное сообщение когда String(error) возвращает пустую строку", () => {
			// Создаем объект, который при String() вернет пустую строку
			const emptyStringError = "";
			const result = IpfsError.fromError(emptyStringError);

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("IPFS operation failed");
			expect(result.originalError).toBe(emptyStringError);
		});

		it("должен обработать Error с сообщением и причиной", () => {
			const error = new Error("Wrapper error");
			const result = IpfsError.fromError(error, "Custom message");

			expect(result).toBeInstanceOf(IpfsError);
			expect(result.message).toBe("Custom message");
			expect(result.originalError).toBe(error);
		});
	});

	describe("type guards", () => {
		it("должен определить validation error", () => {
			const error = new IpfsError("Validation error", IpfsErrorType.VALIDATION);
			expect(IpfsError.isValidationError(error)).toBe(true);
			expect(IpfsError.isValidationError(new Error("Not IpfsError"))).toBe(false);
		});

		it("должен определить network error", () => {
			const error = new IpfsError("Network error", IpfsErrorType.NETWORK);
			expect(IpfsError.isNetworkError(error)).toBe(true);
			expect(IpfsError.isNetworkError(new Error("Not IpfsError"))).toBe(false);
		});

		it("должен определить timeout error", () => {
			const error = new IpfsError("Timeout error", IpfsErrorType.TIMEOUT);
			expect(IpfsError.isTimeoutError(error)).toBe(true);
			expect(IpfsError.isTimeoutError(new Error("Not IpfsError"))).toBe(false);
		});

		it("должен определить not found error", () => {
			const error = new IpfsError("Not found error", IpfsErrorType.NOT_FOUND);
			expect(IpfsError.isNotFoundError(error)).toBe(true);
			expect(IpfsError.isNotFoundError(new Error("Not IpfsError"))).toBe(false);
		});
	});
});
