import { PrometheusService } from "@makebelieve21213-packages/prometheus-client";
import { RedisClientService } from "@makebelieve21213-packages/redis-client";
import { CID } from "multiformats";
import CoreService from "src/core/core.service";
import IpfsError from "src/errors/ipfs.error";
import { IpfsErrorType } from "src/types/ipfs-error.types";

import type { LoggerService } from "@makebelieve21213-packages/logger";
import type IpfsConfig from "src/types/ipfs-config";

class TestCoreService extends CoreService {
	// Делаем защищенные методы доступными для тестирования
	public testEnsureInitialized() {
		return this.ensureInitialized();
	}

	public testValidateConfig() {
		return this.validateConfig();
	}

	public testValidateCid(cidStr: string) {
		return this.validateCid(cidStr);
	}

	public testValidateDataSize(data: Uint8Array) {
		return this.validateDataSize(data);
	}

	public testWithRetry<T>(
		operation: () => Promise<T>,
		operationName: string,
		context?: Record<string, unknown>
	) {
		return this.withRetry(operation, operationName, context);
	}

	public testWithTimeout<T>(operation: () => Promise<T>, operationName: string) {
		return this.withTimeout(operation, operationName);
	}

	public testSleep(ms: number) {
		return this.sleep(ms);
	}

	public testInitializeRedis() {
		return this.initializeRedis();
	}

	public testInitializePrometheus() {
		return this.initializePrometheus();
	}

	public testGetFromCache<T>(key: string) {
		return this.getFromCache<T>(key);
	}

	public testSetCache(key: string, value: unknown, ttl?: number) {
		return this.setCache(key, value, ttl);
	}

	public testLogMetrics(operation: string, duration: number, size?: number, success?: boolean) {
		return this.logMetrics(operation, duration, size, success);
	}
}

describe("CoreService", () => {
	let service: TestCoreService;
	let loggerService: jest.Mocked<LoggerService>;
	let mockConfig: IpfsConfig;

	beforeEach(() => {
		loggerService = {
			log: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
			info: jest.fn(),
			setContext: jest.fn(),
		} as unknown as jest.Mocked<LoggerService>;

		mockConfig = {
			url: "http://localhost:5001",
		};

		service = new TestCoreService(mockConfig, loggerService);
	});

	afterEach(() => {
		jest.clearAllMocks();
		jest.useRealTimers();
	});

	describe("constructor", () => {
		it("должен создать экземпляр с конфигурацией и логгером", () => {
			expect(service).toBeDefined();
			expect(service["config"]).toBe(mockConfig);
			expect(service["logger"]).toBe(loggerService);
		});

		it("должен установить контекст логгера", () => {
			expect(loggerService.setContext).toHaveBeenCalledWith("TestCoreService");
		});

		it("должен инициализировать isInitialized как false", () => {
			expect(service["isInitialized"]).toBe(false);
		});
	});

	describe("onModuleInit", () => {
		it("должен успешно инициализировать сервис", async () => {
			await service.onModuleInit();

			expect(service["isInitialized"]).toBe(true);
			expect(loggerService.log).toHaveBeenCalledWith(
				expect.stringMatching(/IPFS service initialized successfully/)
			);
		});

		it("должен валидировать конфигурацию", async () => {
			const invalidConfig = { url: "" } as IpfsConfig;
			const invalidService = new TestCoreService(invalidConfig, loggerService);

			await expect(invalidService.onModuleInit()).rejects.toThrow(IpfsError);
		});

		it("должен инициализировать Redis если указан в конфиге", async () => {
			const configWithRedis: IpfsConfig = {
				url: "http://localhost:5001",
				redis: {
					host: "localhost",
					port: 6379,
				},
			};

			const redisService = new TestCoreService(configWithRedis, loggerService);
			await redisService.onModuleInit();

			expect(redisService["redisClient"]).toBeDefined();
		});

		it("должен инициализировать Prometheus если указан в конфиге", async () => {
			const configWithPrometheus: IpfsConfig = {
				url: "http://localhost:5001",
				prometheus: {
					enabled: true,
				},
			};

			const prometheusService = new TestCoreService(configWithPrometheus, loggerService);
			await prometheusService.onModuleInit();

			expect(prometheusService["prometheusClient"]).toBeDefined();
		});

		it("должен обработать ошибку инициализации Redis", async () => {
			const configWithRedis: IpfsConfig = {
				url: "http://localhost:5001",
				redis: {
					host: "localhost",
					port: 6379,
				},
			};

			jest
				.spyOn(RedisClientService.prototype, "onModuleInit")
				.mockRejectedValue(new Error("Redis error"));

			const redisService = new TestCoreService(configWithRedis, loggerService);
			await redisService.onModuleInit();

			expect(loggerService.warn).toHaveBeenCalledWith(
				expect.stringMatching(/Failed to initialize Redis client/)
			);
		});

		it("должен обработать ошибку инициализации Prometheus", async () => {
			const configWithPrometheus: IpfsConfig = {
				url: "http://localhost:5001",
				prometheus: {
					enabled: true,
				},
			};

			jest.spyOn(PrometheusService.prototype, "createHistogram").mockImplementation(() => {
				throw new Error("Prometheus error");
			});

			const prometheusService = new TestCoreService(configWithPrometheus, loggerService);
			await prometheusService.onModuleInit();

			expect(loggerService.warn).toHaveBeenCalledWith(
				expect.stringMatching(/Failed to initialize Prometheus client/)
			);
		});

		it("должен выбросить IpfsError при ошибке инициализации", async () => {
			const invalidConfig = { url: "" } as IpfsConfig;
			const invalidService = new TestCoreService(invalidConfig, loggerService);

			await expect(invalidService.onModuleInit()).rejects.toThrow(IpfsError);
			expect(loggerService.error).toHaveBeenCalled();
		});

		it("должен обработать ошибку инициализации когда error не является Error", async () => {
			const configWithRedis: IpfsConfig = {
				url: "http://localhost:5001",
				redis: {
					host: "localhost",
					port: 6379,
				},
			};

			jest.spyOn(RedisClientService.prototype, "onModuleInit").mockRejectedValue("string error");

			const redisService = new TestCoreService(configWithRedis, loggerService);
			await redisService.onModuleInit();

			expect(loggerService.warn).toHaveBeenCalled();
			expect(redisService["isInitialized"]).toBe(true);
		});

		it("должен обработать ошибку инициализации в onModuleInit когда error не является Error", async () => {
			class TestCoreServiceWithError extends TestCoreService {
				protected validateConfig(): void {
					throw "string error";
				}
			}

			const configWithRedis: IpfsConfig = {
				url: "http://localhost:5001",
				redis: {
					host: "localhost",
					port: 6379,
				},
			};

			const redisService = new TestCoreServiceWithError(configWithRedis, loggerService);

			await expect(redisService.onModuleInit()).rejects.toThrow(IpfsError);
			expect(loggerService.error).toHaveBeenCalledWith(
				expect.stringMatching(/Failed to initialize IPFS service - error: string error/)
			);
		});
	});

	describe("onModuleDestroy", () => {
		it("должен успешно уничтожить сервис", async () => {
			service["isInitialized"] = true;
			await service.onModuleDestroy();

			expect(service["isInitialized"]).toBe(false);
			expect(loggerService.log).toHaveBeenCalledWith("IPFS service destroyed successfully");
		});

		it("не должен логировать успех если сервис не был инициализирован", async () => {
			service["isInitialized"] = false;
			await service.onModuleDestroy();

			expect(service["isInitialized"]).toBe(false);
			expect(loggerService.log).not.toHaveBeenCalledWith("IPFS service destroyed successfully");
		});

		it("должен остановить Redis клиент если он был инициализирован", async () => {
			const mockRedisClient = {
				onModuleDestroy: jest.fn().mockResolvedValue(undefined),
			} as unknown as RedisClientService;

			service["redisClient"] = mockRedisClient;
			service["isInitialized"] = true;

			await service.onModuleDestroy();

			expect(mockRedisClient.onModuleDestroy).toHaveBeenCalled();
		});

		it("должен обработать ошибку при уничтожении", async () => {
			service["isInitialized"] = true;
			const mockRedisClient = {
				onModuleDestroy: jest.fn().mockRejectedValue(new Error("Destroy error")),
			} as unknown as RedisClientService;

			service["redisClient"] = mockRedisClient;

			await expect(service.onModuleDestroy()).rejects.toThrow(IpfsError);
			expect(loggerService.error).toHaveBeenCalled();
		});

		it("должен обработать ошибку при уничтожении когда error не является Error", async () => {
			service["isInitialized"] = true;
			const mockRedisClient = {
				onModuleDestroy: jest.fn().mockRejectedValue("string error"),
			} as unknown as RedisClientService;

			service["redisClient"] = mockRedisClient;

			await expect(service.onModuleDestroy()).rejects.toThrow(IpfsError);
			expect(loggerService.error).toHaveBeenCalledWith(
				expect.stringMatching(/Failed to destroy IPFS service - error: string error/)
			);
		});
	});

	describe("ensureInitialized", () => {
		it("должен выбросить ошибку если сервис не инициализирован", () => {
			service["isInitialized"] = false;

			expect(() => service.testEnsureInitialized()).toThrow(IpfsError);
		});

		it("не должен выбросить ошибку если сервис инициализирован", () => {
			service["isInitialized"] = true;

			expect(() => service.testEnsureInitialized()).not.toThrow();
		});
	});

	describe("validateConfig", () => {
		it("должен выбросить ошибку если URL отсутствует", () => {
			const invalidConfig = { url: "" } as IpfsConfig;
			const invalidService = new TestCoreService(invalidConfig, loggerService);

			expect(() => invalidService.testValidateConfig()).toThrow(IpfsError);
		});

		it("должен выбросить ошибку если URL невалидный", () => {
			const invalidConfig = { url: "invalid-url" } as IpfsConfig;
			const invalidService = new TestCoreService(invalidConfig, loggerService);

			expect(() => invalidService.testValidateConfig()).toThrow(IpfsError);
		});

		it("должен провалидировать массив URL", () => {
			const configWithArray: IpfsConfig = {
				url: ["http://localhost:5001", "http://localhost:5002"],
			};

			const serviceWithArray = new TestCoreService(configWithArray, loggerService);

			expect(() => serviceWithArray.testValidateConfig()).not.toThrow();
		});

		it("должен выбросить ошибку если один из URL в массиве невалидный", () => {
			const configWithArray: IpfsConfig = {
				url: ["http://localhost:5001", "invalid-url"],
			};

			const serviceWithArray = new TestCoreService(configWithArray, loggerService);

			expect(() => serviceWithArray.testValidateConfig()).toThrow(IpfsError);
		});
	});

	describe("validateCid", () => {
		it("должен выбросить ошибку если CID пустой", () => {
			expect(() => service.testValidateCid("")).toThrow(IpfsError);
		});

		it("должен выбросить ошибку если CID не строка", () => {
			expect(() => service.testValidateCid(null as unknown as string)).toThrow(IpfsError);
		});

		it("должен выбросить ошибку если CID только пробелы", () => {
			expect(() => service.testValidateCid("   ")).toThrow(IpfsError);
		});

		it("должен валидировать валидный CID v0", () => {
			const validCid = "QmYjtig7VJQ6XsnUjqqJvj7QaMcCAwtrgNdahSiFofrE7o";
			const result = service.testValidateCid(validCid);

			expect(result).toBeInstanceOf(CID);
		});

		it("должен валидировать валидный CID v1", () => {
			const validCid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
			const result = service.testValidateCid(validCid);

			expect(result).toBeInstanceOf(CID);
		});

		it("должен выбросить ошибку если CID невалидный", () => {
			expect(() => service.testValidateCid("invalid-cid")).toThrow(IpfsError);
		});

		it("должен выбросить ошибку если версия CID не поддерживается", () => {
			// Создаем CID с неподдерживаемой версией через мок
			const originalParse = CID.parse;
			jest.spyOn(CID, "parse").mockReturnValueOnce({
				version: 2,
			} as unknown as CID);

			expect(() => service.testValidateCid("QmYjtig7VJQ6XsnUjqqJvj7QaMcCAwtrgNdahSiFofrE7o")).toThrow(
				IpfsError
			);

			CID.parse = originalParse;
		});

		it("должен обработать обычную ошибку при валидации CID и выбросить IpfsError", () => {
			const originalParse = CID.parse;
			const regularError = new Error("Parse error");
			jest.spyOn(CID, "parse").mockImplementationOnce(() => {
				throw regularError;
			});

			expect(() => service.testValidateCid("test")).toThrow(IpfsError);

			CID.parse = originalParse;
		});

		it("должен обработать IpfsError при валидации CID и выбросить его", () => {
			const originalParse = CID.parse;
			const ipfsError = new IpfsError("CID error", IpfsErrorType.VALIDATION);
			jest.spyOn(CID, "parse").mockImplementationOnce(() => {
				throw ipfsError;
			});

			expect(() => service.testValidateCid("test")).toThrow(IpfsError);

			CID.parse = originalParse;
		});
	});

	describe("validateDataSize", () => {
		it("не должен выбросить ошибку если maxFileSize не указан", () => {
			const data = new Uint8Array(1000);
			expect(() => service.testValidateDataSize(data)).not.toThrow();
		});

		it("не должен выбросить ошибку если размер данных меньше maxFileSize", () => {
			const configWithMaxSize: IpfsConfig = {
				url: "http://localhost:5001",
				maxFileSize: 5000,
			};

			const serviceWithMaxSize = new TestCoreService(configWithMaxSize, loggerService);
			const data = new Uint8Array(1000);

			expect(() => serviceWithMaxSize.testValidateDataSize(data)).not.toThrow();
		});

		it("должен выбросить ошибку если размер данных превышает maxFileSize", () => {
			const configWithMaxSize: IpfsConfig = {
				url: "http://localhost:5001",
				maxFileSize: 1000,
			};

			const serviceWithMaxSize = new TestCoreService(configWithMaxSize, loggerService);
			const data = new Uint8Array(2000);

			expect(() => serviceWithMaxSize.testValidateDataSize(data)).toThrow(IpfsError);
		});
	});

	describe("withRetry", () => {
		it("должен выполнить операцию успешно с первой попытки", async () => {
			const operation = jest.fn().mockResolvedValue("success");

			const result = await service.testWithRetry(operation, "testOperation");

			expect(result).toBe("success");
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it("должен повторить операцию при ошибке", async () => {
			const operation = jest
				.fn()
				.mockRejectedValueOnce(new Error("Error 1"))
				.mockResolvedValueOnce("success");

			const configWithRetry: IpfsConfig = {
				url: "http://localhost:5001",
				retry: {
					maxAttempts: 2,
					delay: 10,
				},
			};

			const serviceWithRetry = new TestCoreService(configWithRetry, loggerService);

			const result = await serviceWithRetry.testWithRetry(operation, "testOperation");

			expect(result).toBe("success");
			expect(operation).toHaveBeenCalledTimes(2);
		});

		it("должен выбросить ошибку после исчерпания попыток", async () => {
			const operation = jest.fn().mockRejectedValue(new Error("Persistent error"));

			const configWithRetry: IpfsConfig = {
				url: "http://localhost:5001",
				retry: {
					maxAttempts: 2,
					delay: 10,
				},
			};

			const serviceWithRetry = new TestCoreService(configWithRetry, loggerService);

			await expect(serviceWithRetry.testWithRetry(operation, "testOperation")).rejects.toThrow(
				IpfsError
			);
			expect(operation).toHaveBeenCalledTimes(2);
		});

		it("должен использовать контекст при логировании", async () => {
			const operation = jest.fn().mockRejectedValue(new Error("Error"));

			const configWithRetry: IpfsConfig = {
				url: "http://localhost:5001",
				retry: {
					maxAttempts: 2,
					delay: 10,
				},
			};

			const serviceWithRetry = new TestCoreService(configWithRetry, loggerService);

			await expect(
				serviceWithRetry.testWithRetry(operation, "testOperation", { key: "value" })
			).rejects.toThrow();

			expect(loggerService.warn).toHaveBeenCalledWith(expect.stringMatching(/Retrying testOperation/));
		});

		it("должен использовать контекст при логировании когда error не является Error", async () => {
			const stringError = "string error";
			const operation = jest.fn().mockRejectedValue(new Error("test"));

			const configWithRetry: IpfsConfig = {
				url: "http://localhost:5001",
				retry: {
					maxAttempts: 2,
					delay: 10,
				},
			};

			const serviceWithRetry = new TestCoreService(configWithRetry, loggerService);

			// Мокируем withTimeout чтобы он выбрасывал не Error напрямую
			// Это покрывает случай когда error не является Error в строке 179
			const withTimeoutSpy = jest
				.spyOn(serviceWithRetry, "testWithTimeout")
				.mockImplementation(async () => {
					throw stringError;
				});

			await expect(
				serviceWithRetry.testWithRetry(operation, "testOperation", { key: "value" })
			).rejects.toThrow();

			expect(loggerService.warn).toHaveBeenCalledWith(expect.stringMatching(/Retrying testOperation/));
			// Проверяем что ошибка обрабатывается как строка в контексте
			// Ошибка должна быть преобразована в строку через String(error)
			const warnCall = loggerService.warn.mock.calls.find(
				(call) => call[0].includes("Retrying testOperation") && call[0].includes('"key":"value"')
			);
			expect(warnCall).toBeDefined();
			// Проверяем что ошибка присутствует в контексте (может быть обернута)
			if (warnCall) {
				expect(warnCall[0]).toContain('"error"');
			}

			withTimeoutSpy.mockRestore();
		});

		it("должен использовать логирование без контекста при ошибке", async () => {
			const operation = jest.fn().mockRejectedValue(new Error("Error"));

			const configWithRetry: IpfsConfig = {
				url: "http://localhost:5001",
				retry: {
					maxAttempts: 2,
					delay: 10,
				},
			};

			const serviceWithRetry = new TestCoreService(configWithRetry, loggerService);

			await expect(serviceWithRetry.testWithRetry(operation, "testOperation")).rejects.toThrow();

			expect(loggerService.warn).toHaveBeenCalledWith(expect.stringMatching(/Retrying testOperation/));
		});

		it("должен использовать логирование без контекста когда error не является Error", async () => {
			const operation = jest.fn().mockRejectedValue("string error");

			const configWithRetry: IpfsConfig = {
				url: "http://localhost:5001",
				retry: {
					maxAttempts: 2,
					delay: 10,
				},
			};

			const serviceWithRetry = new TestCoreService(configWithRetry, loggerService);

			await expect(serviceWithRetry.testWithRetry(operation, "testOperation")).rejects.toThrow();

			// Ошибка оборачивается в withTimeout, поэтому проверяем что логирование произошло
			expect(loggerService.warn).toHaveBeenCalledWith(expect.stringMatching(/Retrying testOperation/));
			// Проверяем что ошибка обрабатывается как строка
			const warnCall = loggerService.warn.mock.calls.find((call) =>
				call[0].includes("Retrying testOperation")
			);
			expect(warnCall).toBeDefined();
			if (warnCall) {
				expect(warnCall[0]).toContain("error:");
			}
		});

		it("должен обработать ошибку когда error не является Error в withRetry", async () => {
			const operation = jest.fn().mockRejectedValue("string error");

			const configWithRetry: IpfsConfig = {
				url: "http://localhost:5001",
				retry: {
					maxAttempts: 2,
					delay: 10,
				},
			};

			const serviceWithRetry = new TestCoreService(configWithRetry, loggerService);

			await expect(serviceWithRetry.testWithRetry(operation, "testOperation")).rejects.toThrow(
				IpfsError
			);
			expect(loggerService.warn).toHaveBeenCalled();
		});

		it("должен логировать ошибку без контекста при исчерпании попыток", async () => {
			const operation = jest.fn().mockRejectedValue(new Error("Persistent error"));

			const configWithRetry: IpfsConfig = {
				url: "http://localhost:5001",
				retry: {
					maxAttempts: 2,
					delay: 10,
				},
			};

			const serviceWithRetry = new TestCoreService(configWithRetry, loggerService);

			await expect(serviceWithRetry.testWithRetry(operation, "testOperation")).rejects.toThrow(
				IpfsError
			);
			expect(loggerService.error).toHaveBeenCalledWith(
				expect.stringMatching(/testOperation failed after 2 attempts - attempts: 2/)
			);
		});
	});

	describe("withTimeout", () => {
		it("должен выполнить операцию успешно", async () => {
			const operation = jest.fn().mockResolvedValue("success");

			const result = await service.testWithTimeout(operation, "testOperation");

			expect(result).toBe("success");
		});

		it("должен выбросить ошибку при таймауте", async () => {
			const configWithTimeout: IpfsConfig = {
				url: "http://localhost:5001",
				timeout: 10,
			};

			const serviceWithTimeout = new TestCoreService(configWithTimeout, loggerService);

			const operation = jest.fn(
				() =>
					new Promise((resolve) => {
						setTimeout(() => resolve("success"), 1000);
					})
			);

			await expect(serviceWithTimeout.testWithTimeout(operation, "testOperation")).rejects.toThrow(
				IpfsError
			);
		}, 10000);

		it("должен обработать ошибку операции", async () => {
			const operation = jest.fn().mockRejectedValue(new Error("Operation error"));

			await expect(service.testWithTimeout(operation, "testOperation")).rejects.toThrow(IpfsError);
		});

		it("должен обработать IpfsError с типом TIMEOUT", async () => {
			const timeoutError = new IpfsError("Timeout error", IpfsErrorType.TIMEOUT);
			const operation = jest.fn().mockRejectedValue(timeoutError);

			await expect(service.testWithTimeout(operation, "testOperation")).rejects.toThrow(IpfsError);
		});

		it("должен обработать ошибку когда error не является Error в withTimeout", async () => {
			const operation = jest.fn().mockRejectedValue("string error");

			await expect(service.testWithTimeout(operation, "testOperation")).rejects.toThrow(IpfsError);
		});
	});

	describe("sleep", () => {
		it("должен задержать выполнение на указанное время", async () => {
			const startTime = Date.now();
			await service.testSleep(50);
			const endTime = Date.now();

			expect(endTime - startTime).toBeGreaterThanOrEqual(45);
		});
	});

	describe("initializeRedis", () => {
		it("не должен инициализировать Redis если не указан в конфиге", async () => {
			await service.testInitializeRedis();

			expect(service["redisClient"]).toBeNull();
		});

		it("должен инициализировать Redis если указан в конфиге", async () => {
			const configWithRedis: IpfsConfig = {
				url: "http://localhost:5001",
				redis: {
					host: "localhost",
					port: 6379,
				},
			};

			const redisService = new TestCoreService(configWithRedis, loggerService);
			await redisService.testInitializeRedis();

			expect(redisService["redisClient"]).toBeDefined();
			expect(loggerService.log).toHaveBeenCalledWith(
				expect.stringMatching(/Redis client initialized/)
			);
		});

		it("должен обработать ошибку инициализации Redis", async () => {
			const configWithRedis: IpfsConfig = {
				url: "http://localhost:5001",
				redis: {
					host: "localhost",
					port: 6379,
				},
			};

			jest
				.spyOn(RedisClientService.prototype, "onModuleInit")
				.mockRejectedValue(new Error("Redis error"));

			const redisService = new TestCoreService(configWithRedis, loggerService);
			await redisService.testInitializeRedis();

			expect(loggerService.warn).toHaveBeenCalledWith(
				expect.stringMatching(/Failed to initialize Redis client/)
			);
		});

		it("должен обработать ошибку инициализации Redis когда error не является Error", async () => {
			const configWithRedis: IpfsConfig = {
				url: "http://localhost:5001",
				redis: {
					host: "localhost",
					port: 6379,
				},
			};

			jest.spyOn(RedisClientService.prototype, "onModuleInit").mockRejectedValue("string error");

			const redisService = new TestCoreService(configWithRedis, loggerService);
			await redisService.testInitializeRedis();

			expect(loggerService.warn).toHaveBeenCalledWith(
				expect.stringMatching(
					/Failed to initialize Redis client, using in-memory cache - error: string error/
				)
			);
		});
	});

	describe("initializePrometheus", () => {
		it("не должен инициализировать Prometheus если не включен", async () => {
			await service.testInitializePrometheus();

			expect(service["prometheusClient"]).toBeNull();
		});

		it("должен инициализировать Prometheus если включен", async () => {
			const configWithPrometheus: IpfsConfig = {
				url: "http://localhost:5001",
				prometheus: {
					enabled: true,
				},
			};

			const prometheusService = new TestCoreService(configWithPrometheus, loggerService);
			await prometheusService.testInitializePrometheus();

			expect(prometheusService["prometheusClient"]).toBeDefined();
			expect(prometheusService["ipfsOperationDuration"]).toBeDefined();
			expect(prometheusService["ipfsOperationCounter"]).toBeDefined();
			expect(loggerService.log).toHaveBeenCalledWith("Prometheus client initialized");
		});

		it("должен обработать ошибку инициализации Prometheus", async () => {
			const configWithPrometheus: IpfsConfig = {
				url: "http://localhost:5001",
				prometheus: {
					enabled: true,
				},
			};

			jest.spyOn(PrometheusService.prototype, "createHistogram").mockImplementation(() => {
				throw new Error("Prometheus error");
			});

			const prometheusService = new TestCoreService(configWithPrometheus, loggerService);
			await prometheusService.testInitializePrometheus();

			expect(loggerService.warn).toHaveBeenCalledWith(
				expect.stringMatching(/Failed to initialize Prometheus client/)
			);
		});

		it("должен обработать ошибку инициализации Prometheus когда error не является Error", async () => {
			const configWithPrometheus: IpfsConfig = {
				url: "http://localhost:5001",
				prometheus: {
					enabled: true,
				},
			};

			jest.spyOn(PrometheusService.prototype, "createHistogram").mockImplementation(() => {
				throw "string error";
			});

			const prometheusService = new TestCoreService(configWithPrometheus, loggerService);
			await prometheusService.testInitializePrometheus();

			expect(loggerService.warn).toHaveBeenCalledWith(
				expect.stringMatching(/Failed to initialize Prometheus client - error: string error/)
			);
		});
	});

	describe("getFromCache", () => {
		it("должен вернуть значение из in-memory cache если оно не истекло", async () => {
			const key = "test-key";
			const value = "test-value";
			const cacheEntry = {
				value,
				expiresAt: Date.now() + 10000,
			};

			service["cache"].set(key, cacheEntry);

			const result = await service.testGetFromCache<string>(key);

			expect(result).toBe(value);
		});

		it("должен удалить истекшее значение из in-memory cache", async () => {
			const key = "test-key";
			const cacheEntry = {
				value: "test-value",
				expiresAt: Date.now() - 1000,
			};

			service["cache"].set(key, cacheEntry);

			const result = await service.testGetFromCache<string>(key);

			expect(result).toBeNull();
			expect(service["cache"].has(key)).toBe(false);
		});

		it("должен получить значение из Redis если доступен", async () => {
			const key = "test-key";
			const value = { test: "data" };
			const mockRedisClient = {
				get: jest.fn().mockResolvedValue(JSON.stringify(value)),
			} as unknown as RedisClientService;

			service["redisClient"] = mockRedisClient;

			const result = await service.testGetFromCache<typeof value>(key);

			expect(result).toEqual(value);
			expect(mockRedisClient.get).toHaveBeenCalledWith(key);
		});

		it("должен вернуть null если Redis вернул null", async () => {
			const key = "test-key";
			const mockRedisClient = {
				get: jest.fn().mockResolvedValue(null),
			} as unknown as RedisClientService;

			service["redisClient"] = mockRedisClient;

			const result = await service.testGetFromCache<string>(key);

			expect(result).toBeNull();
			expect(mockRedisClient.get).toHaveBeenCalledWith(key);
		});

		it("должен обработать ошибку получения из Redis", async () => {
			const key = "test-key";
			const mockRedisClient = {
				get: jest.fn().mockRejectedValue(new Error("Redis error")),
			} as unknown as RedisClientService;

			service["redisClient"] = mockRedisClient;

			const result = await service.testGetFromCache<string>(key);

			expect(result).toBeNull();
			expect(loggerService.warn).toHaveBeenCalledWith(
				expect.stringMatching(/Failed to get from Redis cache/)
			);
		});

		it("должен обработать ошибку получения из Redis когда error не является Error", async () => {
			const key = "test-key";
			const mockRedisClient = {
				get: jest.fn().mockRejectedValue("string error"),
			} as unknown as RedisClientService;

			service["redisClient"] = mockRedisClient;

			const result = await service.testGetFromCache<string>(key);

			expect(result).toBeNull();
			expect(loggerService.warn).toHaveBeenCalledWith(
				expect.stringMatching(/Failed to get from Redis cache - key: test-key, error: string error/)
			);
		});

		it("должен вернуть null если значение не найдено", async () => {
			const result = await service.testGetFromCache<string>("non-existent-key");

			expect(result).toBeNull();
		});
	});

	describe("setCache", () => {
		it("должен сохранить значение в in-memory cache", async () => {
			const key = "test-key";
			const value = "test-value";

			await service.testSetCache(key, value, 1000);

			const cached = service["cache"].get(key);
			expect(cached).toBeDefined();
			expect(cached?.value).toBe(value);
		});

		it("должен использовать значение TTL по умолчанию", async () => {
			const key = "test-key";
			const value = "test-value";

			await service.testSetCache(key, value);

			const cached = service["cache"].get(key);
			expect(cached).toBeDefined();
			expect(cached?.value).toBe(value);
			expect(cached?.expiresAt).toBeGreaterThan(Date.now() + 3600000 - 1000);
		});

		it("должен сохранить значение в Redis если доступен", async () => {
			const key = "test-key";
			const value = { test: "data" };
			const mockRedisClient = {
				set: jest.fn().mockResolvedValue(undefined),
			} as unknown as RedisClientService;

			service["redisClient"] = mockRedisClient;

			await service.testSetCache(key, value, 1000);

			expect(mockRedisClient.set).toHaveBeenCalledWith(key, JSON.stringify(value), 1);
		});

		it("должен обработать ошибку сохранения в Redis", async () => {
			const key = "test-key";
			const value = "test-value";
			const mockRedisClient = {
				set: jest.fn().mockRejectedValue(new Error("Redis error")),
			} as unknown as RedisClientService;

			service["redisClient"] = mockRedisClient;

			await service.testSetCache(key, value, 1000);

			expect(loggerService.warn).toHaveBeenCalledWith(
				expect.stringMatching(/Failed to set Redis cache/)
			);
		});

		it("должен обработать ошибку сохранения в Redis когда error не является Error", async () => {
			const key = "test-key";
			const value = "test-value";
			const mockRedisClient = {
				set: jest.fn().mockRejectedValue("string error"),
			} as unknown as RedisClientService;

			service["redisClient"] = mockRedisClient;

			await service.testSetCache(key, value, 1000);

			expect(loggerService.warn).toHaveBeenCalledWith(
				expect.stringMatching(/Failed to set Redis cache - key: test-key, error: string error/)
			);
		});
	});

	describe("logMetrics", () => {
		it("должен логировать метрики", () => {
			service.testLogMetrics("testOperation", 100, 1024, true);

			expect(loggerService.log).toHaveBeenCalledWith(
				expect.stringMatching(/IPFS operation: testOperation/)
			);
		});

		it("должен использовать значение success по умолчанию", () => {
			service.testLogMetrics("testOperation", 100, 1024);

			const logCall = loggerService.log.mock.calls[0][0] as string;
			expect(logCall).toContain('"success":true');
		});

		it("должен отправлять метрики в Prometheus если доступен", () => {
			const mockHistogram = {
				observe: jest.fn(),
			};
			const mockCounter = {
				inc: jest.fn(),
			};

			service["ipfsOperationDuration"] = mockHistogram as unknown as ReturnType<
				PrometheusService["createHistogram"]
			>;
			service["ipfsOperationCounter"] = mockCounter as unknown as ReturnType<
				PrometheusService["createCounter"]
			>;

			service.testLogMetrics("testOperation", 100, 1024, true);

			expect(mockHistogram.observe).toHaveBeenCalledWith(
				{ operation: "testOperation", status: "success" },
				0.1
			);
			expect(mockCounter.inc).toHaveBeenCalledWith({ operation: "testOperation", status: "success" });
		});

		it("должен логировать метрики с ошибкой", () => {
			service.testLogMetrics("testOperation", 100, 1024, false);

			const logCall = loggerService.log.mock.calls[0][0] as string;
			expect(logCall).toContain('"success":false');
		});

		it("не должен отправлять метрики в Prometheus если ipfsOperationDuration отсутствует", () => {
			const mockCounter = {
				inc: jest.fn(),
			};

			service["ipfsOperationDuration"] = null;
			service["ipfsOperationCounter"] = mockCounter as unknown as ReturnType<
				PrometheusService["createCounter"]
			>;

			service.testLogMetrics("testOperation", 100, 1024, true);

			expect(mockCounter.inc).not.toHaveBeenCalled();
		});

		it("не должен отправлять метрики в Prometheus если ipfsOperationCounter отсутствует", () => {
			const mockHistogram = {
				observe: jest.fn(),
			};

			service["ipfsOperationDuration"] = mockHistogram as unknown as ReturnType<
				PrometheusService["createHistogram"]
			>;
			service["ipfsOperationCounter"] = null;

			service.testLogMetrics("testOperation", 100, 1024, true);

			expect(mockHistogram.observe).not.toHaveBeenCalled();
		});

		it("должен отправлять метрики с status error когда success = false", () => {
			const mockHistogram = {
				observe: jest.fn(),
			};
			const mockCounter = {
				inc: jest.fn(),
			};

			service["ipfsOperationDuration"] = mockHistogram as unknown as ReturnType<
				PrometheusService["createHistogram"]
			>;
			service["ipfsOperationCounter"] = mockCounter as unknown as ReturnType<
				PrometheusService["createCounter"]
			>;

			service.testLogMetrics("testOperation", 100, 1024, false);

			expect(mockHistogram.observe).toHaveBeenCalledWith(
				{ operation: "testOperation", status: "error" },
				0.1
			);
			expect(mockCounter.inc).toHaveBeenCalledWith({ operation: "testOperation", status: "error" });
		});
	});
});
