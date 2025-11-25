import { of, throwError, Observable } from "rxjs";
import IpfsMetricsInterceptor from "src/interceptors/ipfs-metrics.interceptor";

import type { LoggerService } from "@makebelieve21213-packages/logger";
import type { CallHandler, ExecutionContext } from "@nestjs/common";

describe("IpfsMetricsInterceptor", () => {
	let interceptor: IpfsMetricsInterceptor;
	let loggerService: jest.Mocked<LoggerService>;
	let executionContext: jest.Mocked<ExecutionContext>;
	let callHandler: jest.Mocked<CallHandler>;

	beforeEach(() => {
		loggerService = {
			log: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
			info: jest.fn(),
			setContext: jest.fn(),
		} as unknown as jest.Mocked<LoggerService>;

		executionContext = {
			switchToHttp: jest.fn().mockReturnValue({
				getRequest: jest.fn().mockReturnValue({
					method: "GET",
					url: "/test",
				}),
			}),
		} as unknown as jest.Mocked<ExecutionContext>;

		callHandler = {
			handle: jest.fn(),
		} as unknown as jest.Mocked<CallHandler>;

		interceptor = new IpfsMetricsInterceptor(loggerService);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe("constructor", () => {
		it("должен создать экземпляр interceptor", () => {
			expect(interceptor).toBeInstanceOf(IpfsMetricsInterceptor);
		});

		it("должен установить контекст логгера", () => {
			expect(loggerService.setContext).toHaveBeenCalledWith("IpfsMetricsInterceptor");
		});
	});

	describe("intercept", () => {
		it("должен логировать успешный запрос с метриками", (done) => {
			callHandler.handle.mockReturnValue(of("success"));

			const result = interceptor.intercept(executionContext, callHandler);

			(result as Observable<unknown>).subscribe({
				next: () => {
					expect(loggerService.log).toHaveBeenCalledWith(
						expect.stringMatching(/\[IPFS Metrics\] GET \/test - \d+ms/)
					);
					done();
				},
			});
		});

		it("должен логировать ошибку с метриками", (done) => {
			const error = new Error("Test error");
			callHandler.handle.mockReturnValue(throwError(() => error));

			const result = interceptor.intercept(executionContext, callHandler);

			(result as Observable<unknown>).subscribe({
				error: () => {
					expect(loggerService.error).toHaveBeenCalledWith(
						expect.stringMatching(/\[IPFS Metrics\] GET \/test - \d+ms - ERROR: Test error/)
					);
					done();
				},
			});
		});

		it("должен логировать ошибку с unknown типом", (done) => {
			const error = "String error";
			callHandler.handle.mockReturnValue(throwError(() => error));

			const result = interceptor.intercept(executionContext, callHandler);

			(result as Observable<unknown>).subscribe({
				error: () => {
					expect(loggerService.error).toHaveBeenCalledWith(
						expect.stringMatching(/\[IPFS Metrics\] GET \/test - \d+ms - ERROR: String error/)
					);
					done();
				},
			});
		});

		it("должен вернуть observable из callHandler", () => {
			const observable = of("test");
			callHandler.handle.mockReturnValue(observable);

			const result = interceptor.intercept(executionContext, callHandler);

			expect(result).toBe(observable);
		});

		it("должен использовать правильный метод и URL из запроса", (done) => {
			const mockGetRequest = jest.fn().mockReturnValue({
				method: "POST",
				url: "/api/ipfs/add",
			});
			executionContext.switchToHttp = jest.fn().mockReturnValue({
				getRequest: mockGetRequest,
			});

			callHandler.handle.mockReturnValue(of("success"));

			const result = interceptor.intercept(executionContext, callHandler);

			(result as Observable<unknown>).subscribe({
				next: () => {
					expect(loggerService.log).toHaveBeenCalledWith(
						expect.stringMatching(/\[IPFS Metrics\] POST \/api\/ipfs\/add - \d+ms/)
					);
					done();
				},
			});
		});

		it("должен измерять время выполнения операции", (done) => {
			const observable = new Observable<unknown>((subscriber) => {
				setTimeout(() => {
					subscriber.next("success");
					subscriber.complete();
				}, 100);
			});
			callHandler.handle.mockReturnValue(observable);

			const result = interceptor.intercept(executionContext, callHandler);

			(result as Observable<unknown>).subscribe({
				next: () => {
					const logCall = loggerService.log.mock.calls[0][0] as string;
					const durationMatch = logCall.match(/(\d+)ms/);
					expect(durationMatch).toBeTruthy();
					if (durationMatch) {
						const duration = parseInt(durationMatch[1], 10);
						expect(duration).toBeGreaterThanOrEqual(90);
					}
					done();
				},
			});
		});
	});
});
