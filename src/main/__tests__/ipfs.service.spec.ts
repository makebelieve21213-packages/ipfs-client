import { Buffer } from "buffer";

import {
	mockCat,
	mockStat,
	mockStop,
	mockHelia,
	mockFs,
	createHeliaHTTP,
	trustlessGateway,
	unixfs,
} from "src/__tests__/__mocks__/helia";
import IpfsError from "src/errors/ipfs.error";
import IpfsCoreService from "src/main/ipfs-core.service";
import { IpfsErrorType } from "src/types/ipfs-error.types";

import type { LoggerService } from "@makebelieve21213-packages/logger";
import type IpfsConfig from "src/types/ipfs-config";

// Kubo API base URL для тестов
const KUBO_API_URL = "http://localhost:5001/api/v0";

describe("IpfsCoreService", () => {
	let service: IpfsCoreService;
	let loggerService: jest.Mocked<LoggerService>;
	let fetchMock: jest.SpyInstance;

	const mockConfig: IpfsConfig = {
		url: KUBO_API_URL,
	};

	beforeEach(async () => {
		jest.clearAllMocks();

		// Мокируем fetch для Kubo API
		fetchMock = jest
			.spyOn(global, "fetch")
			.mockImplementation(async (...args: Parameters<typeof fetch>) => {
				const input = args[0];
				const url =
					typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
				if (url.includes("/id")) {
					return { ok: true, json: async () => ({ ID: "test-peer-id" }) } as Response;
				}
				if (url.includes("/add")) {
					return { ok: true, json: async () => ({ Hash: "mockedCID" }) } as Response;
				}
				if (url.includes("/pin/add")) {
					return { ok: true } as Response;
				}
				if (url.includes("/pin/rm")) {
					return { ok: true } as Response;
				}
				return { ok: false } as Response;
			});

		mockCat.mockReturnValue({
			[Symbol.asyncIterator]: async function* () {
				yield new Uint8Array([]);
			},
		});

		createHeliaHTTP.mockResolvedValue(mockHelia);
		trustlessGateway.mockReturnValue({});
		unixfs.mockReturnValue(mockFs);

		const mockLogger: LoggerService = {
			log: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
			info: jest.fn(),
			setContext: jest.fn(),
		} as unknown as LoggerService;

		loggerService = mockLogger as jest.Mocked<LoggerService>;
		service = new IpfsCoreService(mockConfig, loggerService);
	});

	afterEach(() => {
		if (typeof fetchMock !== "undefined") {
			fetchMock.mockRestore();
		}
		jest.clearAllMocks();
	});

	describe("constructor", () => {
		it("должен корректно инициализироваться с конфигурацией IPFS", () => {
			expect(service).toBeDefined();
			expect(service["config"]).toBe(mockConfig);
		});

		it("должен установить контекст логгера при создании экземпляра", () => {
			expect(loggerService.setContext).toHaveBeenCalledWith("IpfsCoreService");
		});

		it("должен сохранить logger в приватном поле", () => {
			expect(service["logger"]).toBe(loggerService);
		});

		it("должен создать экземпляр с переданным loggerService", () => {
			const newMockLogger: LoggerService = {
				log: jest.fn(),
				error: jest.fn(),
				warn: jest.fn(),
				debug: jest.fn(),
				info: jest.fn(),
				setContext: jest.fn(),
			} as unknown as LoggerService;

			// Создаем новый экземпляр с явной передачей loggerService
			const newService = new IpfsCoreService(mockConfig, newMockLogger);

			expect(newService).toBeDefined();
			// Проверяем, что loggerService был передан и использован в конструкторе
			expect(newMockLogger.setContext).toHaveBeenCalledWith("IpfsCoreService");
			expect(newService["logger"]).toBe(newMockLogger);
			// Проверяем, что logger действительно сохранен в приватном поле
			expect(newService["logger"]).toBeDefined();
		});
	});

	describe("onModuleInit", () => {
		it("должен проверить Kubo API и создать IPFS клиент с правильным URL", async () => {
			await service.onModuleInit();

			expect(fetchMock).toHaveBeenCalledWith(
				`${KUBO_API_URL}/id`,
				expect.objectContaining({ method: "POST" })
			);
			expect(trustlessGateway).toHaveBeenCalledWith({
				gateways: [mockConfig.url],
			});
			expect(createHeliaHTTP).toHaveBeenCalled();
			expect(unixfs).toHaveBeenCalledWith(mockHelia);
			expect(service["helia"]).toBe(mockHelia);
			expect(service["kuboApiUrl"]).toBe(KUBO_API_URL);
			expect(loggerService.log).toHaveBeenCalledWith(
				expect.stringMatching(/IPFS Kubo API initialized/)
			);
		});

		it("должен использовать 'unknown' для peerId когда Kubo /id не возвращает ID", async () => {
			fetchMock.mockImplementation(async (input: unknown) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.toString()
							: ((input as { url?: string })?.url ?? "");
				if (url.includes("/id")) {
					return { ok: true, json: async () => ({}) } as Response;
				}
				return { ok: false } as Response;
			});

			await service.onModuleInit();

			expect(loggerService.log).toHaveBeenCalledWith(expect.stringMatching(/peerId: unknown, url:/));
		});

		it("должен обработать ошибку при инициализации и выбросить IpfsError", async () => {
			const error = new Error("Connection failed");
			createHeliaHTTP.mockRejectedValue(error);

			await expect(service.onModuleInit()).rejects.toThrow(IpfsError);
			expect(loggerService.error).toHaveBeenCalled();
		});

		it("должен обработать ошибку Kubo API при инициализации", async () => {
			fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

			await expect(service.onModuleInit()).rejects.toThrow(IpfsError);
		});

		it("должен обернуть ошибку в IpfsError с правильным сообщением и причиной", async () => {
			const error = new Error("Connection failed");
			createHeliaHTTP.mockRejectedValue(error);

			try {
				await service.onModuleInit();
				expect(true).toBe(false); // Не должно дойти до этой строки
			} catch (thrownError) {
				expect(thrownError).toBeInstanceOf(IpfsError);
				expect((thrownError as IpfsError).message).toBe("Failed to initialize IPFS Helia client");
				expect((thrownError as IpfsError).originalError).toBe(error);
			}
			expect(loggerService.error).toHaveBeenCalled();
		});

		it("должен обработать ошибку инициализации с не-Error объектом", async () => {
			const nonError = "String error";
			createHeliaHTTP.mockRejectedValue(nonError);

			await expect(service.onModuleInit()).rejects.toThrow(IpfsError);
			expect(loggerService.error).toHaveBeenCalledWith(
				expect.stringContaining("Failed to initialize IPFS Helia client - error: String error")
			);
		});
	});

	describe("onModuleDestroy", () => {
		beforeEach(async () => {
			await service.onModuleInit();
		});

		it("должен остановить IPFS клиент", async () => {
			await service.onModuleDestroy();

			expect(mockStop).toHaveBeenCalled();
			expect(loggerService.log).toHaveBeenCalledWith(
				expect.stringMatching(/IPFS service destroyed successfully/)
			);
		});

		it("должен обработать ошибку при остановке и залогировать её", async () => {
			const error = new Error("Stop failed");
			mockStop.mockRejectedValue(error);

			await service.onModuleDestroy();
			expect(loggerService.error).toHaveBeenCalled();
		});

		it("должен обработать ошибку остановки с не-Error объектом", async () => {
			const nonError = { code: 500, message: "Server error" };
			mockStop.mockRejectedValue(nonError);

			await service.onModuleDestroy();
			expect(loggerService.error).toHaveBeenCalledWith(
				expect.stringContaining("Failed to stop IPFS Helia client - error: [object Object]")
			);
		});
	});

	describe("addFile", () => {
		beforeEach(async () => {
			await service.onModuleInit();
		});

		it("должен добавить строку в IPFS через Kubo API и вернуть CID", async () => {
			const testString = "Hello, IPFS!";
			const expectedCid = "mockedCID";

			const result = await service.addFile(testString);

			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining("/add?pin=true&cid-version=1"),
				expect.objectContaining({ method: "POST" })
			);
			expect(result).toBe(expectedCid);
		});

		it("должен добавить Uint8Array в IPFS через Kubo API и вернуть CID", async () => {
			const testData = new Uint8Array([1, 2, 3, 4, 5]);
			const expectedCid = "mockedCID";

			const result = await service.addFile(testData);

			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining("/add"),
				expect.objectContaining({ method: "POST", body: expect.any(FormData) })
			);
			expect(result).toBe(expectedCid);
		});

		it("должен передавать ошибки от Kubo API", async () => {
			service["config"].retry = { maxAttempts: 1, delay: 0 };
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				text: async () => "Internal Server Error",
			});

			await expect(service.addFile("test")).rejects.toThrow(IpfsError);
		});

		it("должен выбросить ошибку при превышении maxFileSize", async () => {
			const configWithLimit: IpfsConfig = {
				...mockConfig,
				maxFileSize: 10,
			};
			const serviceWithLimit = new IpfsCoreService(configWithLimit, loggerService);
			await serviceWithLimit.onModuleInit();

			const largeData = new Uint8Array(100);

			await expect(serviceWithLimit.addFile(largeData)).rejects.toThrow(IpfsError);
			expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/add"), expect.any(Object));
		});
	});

	describe("addJson", () => {
		beforeEach(async () => {
			await service.onModuleInit();
		});

		it("должен добавить простой объект в IPFS через addFile", async () => {
			const testObject = { name: "test", value: 123 };
			const expectedCid = "mockedCID";

			const result = await service.addJson(testObject);

			expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/add"), expect.any(Object));
			expect(result).toBe(expectedCid);
		});

		it("должен передавать ошибки от Kubo API при добавлении JSON", async () => {
			service["config"].retry = { maxAttempts: 1, delay: 0 };
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				text: async () => "Add failed",
			});

			await expect(service.addJson({ test: "data" })).rejects.toThrow(IpfsError);
		});
	});

	describe("getFile", () => {
		beforeEach(async () => {
			await service.onModuleInit();
		});

		it("должен получить файл по CID и вернуть Buffer", async () => {
			const testCid = "QmTestFile";
			const testData = [
				new Uint8Array([1, 2, 3]),
				new Uint8Array([4, 5, 6]),
				new Uint8Array([7, 8, 9]),
			];

			mockCat.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					for (const chunk of testData) {
						yield chunk;
					}
				},
			});

			const result = await service.getFile(testCid);

			expect(mockCat).toHaveBeenCalled();
			expect(result).toBeInstanceOf(Buffer);
			expect(result).toEqual(Buffer.concat(testData));
		});

		it("должен передавать ошибки от IPFS клиента при получении файла", async () => {
			const testCid = "QmErrorFile";
			const error = new Error("File error");

			mockCat.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					throw error;
				},
			});

			await expect(service.getFile(testCid)).rejects.toThrow(IpfsError);
		});

		it("должен получить файл из кэша если он там есть", async () => {
			const testCid = "QmCachedFile";
			const cachedBuffer = Buffer.from("cached data");

			// Устанавливаем значение в кэш
			await service["setCache"](`file:${testCid}`, cachedBuffer);

			const result = await service.getFile(testCid);

			expect(result).toEqual(cachedBuffer);
			expect(loggerService.log).toHaveBeenCalledWith(`File retrieved from cache - cid: ${testCid}`);
			expect(mockCat).not.toHaveBeenCalled();
		});

		it("должен выбросить IpfsError с типом NOT_FOUND при ошибке 'not found'", async () => {
			const testCid = "QmNotFound";
			const error = new Error("not found");

			// Мокируем withRetry чтобы ошибка попала в catch блок напрямую
			service["withRetry"] = jest.fn().mockRejectedValue(error);

			try {
				await service.getFile(testCid);
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(IpfsError);
				expect((e as IpfsError).errorType).toBe(IpfsErrorType.NOT_FOUND);
			}
		}, 10000);

		it("должен выбросить ошибку при пустых данных", async () => {
			await expect(service.addFile("")).rejects.toThrow(IpfsError);
		});

		it("должен выбросить ошибку при пустом Uint8Array", async () => {
			await expect(service.addFile(new Uint8Array(0))).rejects.toThrow(IpfsError);
		});
	});

	describe("addJson", () => {
		beforeEach(async () => {
			await service.onModuleInit();
		});

		it("должен выбросить ошибку при пустом объекте", async () => {
			await expect(service.addJson({})).rejects.toThrow(IpfsError);
		});

		it("должен выбросить ошибку при null", async () => {
			await expect(service.addJson(null as unknown as object)).rejects.toThrow(IpfsError);
		});
	});

	describe("getFileStream", () => {
		beforeEach(async () => {
			await service.onModuleInit();
		});

		it("должен вернуть поток данных", async () => {
			const testCid = "QmStream";
			const testData = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];

			mockCat.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					for (const chunk of testData) {
						yield chunk;
					}
				},
			});

			const chunks: Uint8Array[] = [];
			for await (const chunk of service.getFileStream(testCid)) {
				chunks.push(chunk);
			}

			expect(chunks).toEqual(testData);
		});

		it("должен выбросить IpfsError с типом NOT_FOUND при ошибке 'not found'", async () => {
			const testCid = "QmNotFound";
			const error = new Error("not found");

			mockCat.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					throw error;
				},
			});

			await expect(async () => {
				for await (const _ of service.getFileStream(testCid)) {
					// Потребляем поток
				}
			}).rejects.toThrow(IpfsError);
		});

		it("должен обработать другую ошибку в getFileStream", async () => {
			const testCid = "QmStreamError";
			const error = new Error("stream error");

			mockCat.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					throw error;
				},
			});

			await expect(async () => {
				for await (const _ of service.getFileStream(testCid)) {
					// Потребляем поток
				}
			}).rejects.toThrow(IpfsError);
		});
	});

	describe("getJson", () => {
		beforeEach(async () => {
			await service.onModuleInit();
		});

		it("должен получить и распарсить JSON", async () => {
			const testCid = "QmJson";
			const testObject = { name: "test", value: 123 };
			const testData = Buffer.from(JSON.stringify(testObject));

			mockCat.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					yield new Uint8Array(testData);
				},
			});

			const result = await service.getJson(testCid);

			expect(result).toEqual(testObject);
		});

		it("должен выбросить ошибку при невалидном JSON", async () => {
			const testCid = "QmInvalidJson";
			const invalidJson = Buffer.from("invalid json");

			mockCat.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					yield new Uint8Array(invalidJson);
				},
			});

			await expect(service.getJson(testCid)).rejects.toThrow(IpfsError);
		});
	});

	describe("exists", () => {
		beforeEach(async () => {
			await service.onModuleInit();
		});

		it("должен вернуть true если файл существует", async () => {
			const testCid = "QmExists";
			mockStat.mockResolvedValue({});

			const result = await service.exists(testCid);

			expect(result).toBe(true);
			expect(mockStat).toHaveBeenCalled();
		});

		it("должен вернуть false если файл не существует", async () => {
			const testCid = "QmNotExists";
			mockStat.mockRejectedValue(new Error("not found"));

			const result = await service.exists(testCid);

			expect(result).toBe(false);
		});
	});

	describe("pin", () => {
		beforeEach(async () => {
			await service.onModuleInit();
		});

		it("должен закрепить файл через Kubo /pin/add", async () => {
			const testCid = "QmPin";

			await service.pin(testCid);

			expect(fetchMock).toHaveBeenCalledWith(
				`${KUBO_API_URL}/pin/add?arg=${testCid}`,
				expect.objectContaining({ method: "POST" })
			);
			expect(loggerService.log).toHaveBeenCalledWith(expect.stringMatching(/File pinned/));
		});

		it("должен обработать ошибку при pin", async () => {
			const testCid = "QmPinError";
			service["config"].retry = { maxAttempts: 1, delay: 0 };
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				text: async () => "Pin error",
			});

			await expect(service.pin(testCid)).rejects.toThrow(IpfsError);
		});
	});

	describe("unpin", () => {
		beforeEach(async () => {
			await service.onModuleInit();
		});

		it("должен открепить файл через Kubo /pin/rm", async () => {
			const testCid = "QmUnpin";

			await service.unpin(testCid);

			expect(fetchMock).toHaveBeenCalledWith(
				`${KUBO_API_URL}/pin/rm?arg=${testCid}`,
				expect.objectContaining({ method: "POST" })
			);
			expect(loggerService.log).toHaveBeenCalledWith(expect.stringMatching(/File unpinned/));
		});

		it("должен обработать ошибку при unpin", async () => {
			const testCid = "QmUnpinError";
			service["config"].retry = { maxAttempts: 1, delay: 0 };
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				text: async () => "Unpin error",
			});

			await expect(service.unpin(testCid)).rejects.toThrow(IpfsError);
		});

		it("должен не выбрасывать ошибку при 'not pinned'", async () => {
			const testCid = "QmUnpinNotPinned";
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => "not pinned",
			});

			await expect(service.unpin(testCid)).resolves.not.toThrow();
		});
	});

	describe("healthCheck", () => {
		it("должен вернуть false если сервис не инициализирован", async () => {
			service["isInitialized"] = false;
			const result = await service.healthCheck();

			expect(result).toBe(false);
		});

		it("должен вернуть false если kuboApiUrl не инициализирован", async () => {
			service["isInitialized"] = true;
			service["kuboApiUrl"] = undefined as unknown as string;
			const result = await service.healthCheck();

			expect(result).toBe(false);
		});

		it("должен вернуть true если Kubo API доступен", async () => {
			await service.onModuleInit();
			const result = await service.healthCheck();

			expect(fetchMock).toHaveBeenCalledWith(
				`${KUBO_API_URL}/id`,
				expect.objectContaining({ method: "POST" })
			);
			expect(result).toBe(true);
		});

		it("должен вернуть false при ошибке Kubo API", async () => {
			await service.onModuleInit();
			fetchMock.mockResolvedValueOnce({ ok: false });

			const result = await service.healthCheck();

			expect(result).toBe(false);
		});

		it("должен вернуть false при сетевой ошибке", async () => {
			await service.onModuleInit();
			fetchMock.mockRejectedValueOnce(new Error("Network error"));

			const result = await service.healthCheck();

			expect(result).toBe(false);
		});
	});

	describe("getFileMetadata", () => {
		beforeEach(async () => {
			await service.onModuleInit();
		});

		it("должен получить метаданные файла с fileSize", async () => {
			const testCid = "QmMetadata";
			const mockStat = { fileSize: BigInt(1024) };
			service["fs"].stat = jest.fn().mockResolvedValue(mockStat);

			const result = await service.getFileMetadata(testCid);

			expect(result.size).toBe(1024);
			expect(result.cid).toBe(testCid);
			expect(loggerService.log).toHaveBeenCalledWith(expect.stringMatching(/File metadata retrieved/));
		});

		it("должен получить метаданные файла с size", async () => {
			const testCid = "QmMetadataSize";
			const mockStat = { size: 2048 };
			service["fs"].stat = jest.fn().mockResolvedValue(mockStat);

			const result = await service.getFileMetadata(testCid);

			expect(result.size).toBe(2048);
			expect(result.cid).toBe(testCid);
		});

		it("должен использовать 0 если размер не указан", async () => {
			const testCid = "QmMetadataNoSize";
			const mockStat = {};
			service["fs"].stat = jest.fn().mockResolvedValue(mockStat);

			const result = await service.getFileMetadata(testCid);

			expect(result.size).toBe(0);
		});

		it("должен выбросить IpfsError с типом NOT_FOUND при ошибке 'not found'", async () => {
			const testCid = "QmMetadataNotFound";
			const error = new Error("not found");
			// Устанавливаем maxAttempts = 1 чтобы ошибка не перехватывалась withRetry
			service["config"].retry = { maxAttempts: 1, delay: 0 };
			service["fs"].stat = jest.fn().mockRejectedValue(error);

			try {
				await service.getFileMetadata(testCid);
				expect(true).toBe(false); // Не должно дойти до этой строки
			} catch (e) {
				expect(e).toBeInstanceOf(IpfsError);
				expect((e as IpfsError).errorType).toBe(IpfsErrorType.NOT_FOUND);
			}
		});

		it("должен обработать ошибку 'not found' в getFileMetadata и залогировать метрики", async () => {
			const testCid = "QmMetadataNotFoundMetrics";
			const error = new Error("not found");

			// Мокируем withRetry чтобы ошибка попала в catch блок
			service["withRetry"] = jest.fn().mockRejectedValue(error);

			try {
				await service.getFileMetadata(testCid);
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(IpfsError);
				expect((e as IpfsError).errorType).toBe(IpfsErrorType.NOT_FOUND);
			}
		});

		it("должен обработать IpfsError с 'not found' в originalErrorMessage", async () => {
			const testCid = "QmMetadataOriginalNotFound";
			const originalError = new Error("not found");
			const ipfsError = new IpfsError(
				"Wrapped error",
				IpfsErrorType.OPERATION,
				undefined,
				originalError
			);

			// Мокируем withRetry чтобы ошибка попала в catch блок
			service["withRetry"] = jest.fn().mockRejectedValue(ipfsError);

			try {
				await service.getFileMetadata(testCid);
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(IpfsError);
				expect((e as IpfsError).errorType).toBe(IpfsErrorType.NOT_FOUND);
			}
		});

		it("должен выбросить IpfsError с типом OPERATION при ошибке, не связанной с 'not found'", async () => {
			const testCid = "QmMetadataOperationError";
			const error = new Error("connection timeout");

			// Мокируем withRetry чтобы ошибка попала в catch блок
			service["withRetry"] = jest.fn().mockRejectedValue(error);

			try {
				await service.getFileMetadata(testCid);
				expect(true).toBe(false); // Не должно дойти до этой строки
			} catch (e) {
				expect(e).toBeInstanceOf(IpfsError);
				expect((e as IpfsError).errorType).toBe(IpfsErrorType.OPERATION);
				expect((e as IpfsError).message).toBe(`Failed to get file metadata: ${testCid}`);
			}
		});

		it("должен обработать ошибку getFileMetadata с не-Error объектом", async () => {
			const testCid = "QmMetadataNonError";
			const nonError = "String error message";

			// Мокируем withRetry чтобы ошибка попала в catch блок
			service["withRetry"] = jest.fn().mockRejectedValue(nonError);

			try {
				await service.getFileMetadata(testCid);
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(IpfsError);
				expect((e as IpfsError).errorType).toBe(IpfsErrorType.OPERATION);
			}
		});

		it("должен обработать IpfsError с originalError не являющимся Error", async () => {
			const testCid = "QmMetadataIpfsErrorNonError";
			const originalError = "String original error";
			const ipfsError = new IpfsError(
				"Wrapped error",
				IpfsErrorType.OPERATION,
				undefined,
				originalError
			);

			// Мокируем withRetry чтобы ошибка попала в catch блок
			service["withRetry"] = jest.fn().mockRejectedValue(ipfsError);

			try {
				await service.getFileMetadata(testCid);
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(IpfsError);
				expect((e as IpfsError).errorType).toBe(IpfsErrorType.OPERATION);
			}
		});

		it("должен обработать IpfsError с originalError равным null", async () => {
			const testCid = "QmMetadataIpfsErrorNull";
			const ipfsError = new IpfsError("Wrapped error", IpfsErrorType.OPERATION, undefined, null);

			// Мокируем withRetry чтобы ошибка попала в catch блок
			service["withRetry"] = jest.fn().mockRejectedValue(ipfsError);

			try {
				await service.getFileMetadata(testCid);
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(IpfsError);
				expect((e as IpfsError).errorType).toBe(IpfsErrorType.OPERATION);
			}
		});

		it("должен обработать IpfsError с originalError равным undefined и использовать error в строке 418", async () => {
			const testCid = "QmMetadataIpfsErrorUndefined";
			const ipfsError = new IpfsError("not found", IpfsErrorType.OPERATION, undefined, undefined);

			// Мокируем withRetry чтобы ошибка попала в catch блок
			service["withRetry"] = jest.fn().mockRejectedValue(ipfsError);

			try {
				await service.getFileMetadata(testCid);
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(IpfsError);
				expect((e as IpfsError).errorType).toBe(IpfsErrorType.NOT_FOUND);
				// Проверяем, что использовался error (ipfsError), а не originalError
				expect((e as IpfsError).originalError).toBe(ipfsError);
			}
		});
	});

	describe("ensureInitialized", () => {
		it("должен выбросить ошибку если helia не инициализирован", async () => {
			service["isInitialized"] = true;
			service["helia"] = undefined as never;

			expect(() => service["ensureInitialized"]()).toThrow(IpfsError);
		});
	});

	describe("onModuleInit (config variants)", () => {
		it("должен работать с массивом URL", async () => {
			const configWithArray: IpfsConfig = {
				url: [KUBO_API_URL, "http://localhost:5002/api/v0"],
			};

			const serviceWithArray = new IpfsCoreService(configWithArray, loggerService);
			await serviceWithArray.onModuleInit();

			expect(serviceWithArray["kuboApiUrl"]).toBe(KUBO_API_URL);
			expect(trustlessGateway).toHaveBeenCalledWith({
				gateways: configWithArray.url,
			});
		});

		it("должен использовать heliaOptions из конфига", async () => {
			const configWithOptions: IpfsConfig = {
				url: KUBO_API_URL,
				heliaOptions: {},
			};

			const serviceWithOptions = new IpfsCoreService(configWithOptions, loggerService);
			await serviceWithOptions.onModuleInit();

			expect(createHeliaHTTP).toHaveBeenCalled();
		});
	});

	describe("onModuleDestroy", () => {
		it("должен обработать ошибку при остановке helia", async () => {
			await service.onModuleInit();
			mockStop.mockRejectedValue(new Error("Stop error"));

			await service.onModuleDestroy();

			expect(loggerService.error).toHaveBeenCalledWith(
				expect.stringMatching(/Failed to stop IPFS Helia client/)
			);
		});
	});
});
