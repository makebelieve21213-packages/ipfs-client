import { Buffer } from "buffer";

import {
	mockAddBytes,
	mockCat,
	mockStat,
	mockStop,
	mockPinsAdd,
	mockPinsRm,
	mockHelia,
	mockFs,
	createHeliaHTTP,
	trustlessGateway,
	unixfs,
} from "src/__tests__/__mocks__/helia";
import IpfsError from "src/errors/ipfs.error";
import IpfsCoreService from "src/main/ipfs-core.service";
import { IpfsErrorType } from "src/types/ipfs-error.types";

import type { Helia } from "@helia/http";
import type { LoggerService } from "@makebelieve21213-packages/logger";
import type { CID } from "multiformats";
import type IpfsConfig from "src/types/ipfs-config";

// Импортируем моки после объявления jest.mock

describe("IpfsCoreService", () => {
	let service: IpfsCoreService;
	let loggerService: jest.Mocked<LoggerService>;

	const mockConfig: IpfsConfig = {
		url: "http://localhost:5001",
	};

	beforeEach(async () => {
		jest.clearAllMocks();

		mockAddBytes.mockResolvedValue({
			toString: () => "mockedCID",
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
		it("должен создать IPFS клиент с правильным URL", async () => {
			await service.onModuleInit();

			expect(trustlessGateway).toHaveBeenCalledWith({
				gateways: [mockConfig.url],
			});
			expect(createHeliaHTTP).toHaveBeenCalled();
			expect(unixfs).toHaveBeenCalledWith(mockHelia);
			expect(service["helia"]).toBe(mockHelia);
			expect(loggerService.log).toHaveBeenCalledWith(
				expect.stringMatching(/IPFS service initialized successfully/)
			);
		});

		it("должен обработать ошибку при инициализации и выбросить IpfsError", async () => {
			const error = new Error("Connection failed");
			createHeliaHTTP.mockRejectedValue(error);

			await expect(service.onModuleInit()).rejects.toThrow(IpfsError);
			expect(loggerService.error).toHaveBeenCalled();
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

		it("должен добавить строку в IPFS и вернуть CID", async () => {
			const testString = "Hello, IPFS!";
			const expectedCid = "QmTest123";

			mockAddBytes.mockResolvedValue({
				toString: () => expectedCid,
			});

			const result = await service.addFile(testString);

			expect(mockAddBytes).toHaveBeenCalledWith(new TextEncoder().encode(testString));
			expect(result).toBe(expectedCid);
		});

		it("должен добавить Uint8Array в IPFS и вернуть CID", async () => {
			const testData = new Uint8Array([1, 2, 3, 4, 5]);
			const expectedCid = "QmTest456";

			mockAddBytes.mockResolvedValue({
				toString: () => expectedCid,
			});

			const result = await service.addFile(testData);

			expect(mockAddBytes).toHaveBeenCalledWith(testData);
			expect(result).toBe(expectedCid);
		});

		it("должен передавать ошибки от IPFS клиента", async () => {
			const testString = "test";
			const error = new Error("IPFS connection failed");

			mockAddBytes.mockRejectedValue(error);

			await expect(service.addFile(testString)).rejects.toThrow(IpfsError);
		});
	});

	describe("addJson", () => {
		beforeEach(async () => {
			await service.onModuleInit();
		});

		it("должен добавить простой объект в IPFS", async () => {
			const testObject = { name: "test", value: 123 };
			const expectedCid = "QmJsonTest";

			mockAddBytes.mockResolvedValue({
				toString: () => expectedCid,
			});

			const result = await service.addJson(testObject);

			const expectedBuffer = Buffer.from(JSON.stringify(testObject));
			expect(mockAddBytes).toHaveBeenCalledWith(expectedBuffer);
			expect(result).toBe(expectedCid);
		});

		it("должен передавать ошибки от IPFS клиента при добавлении JSON", async () => {
			const testObject = { test: "data" };
			const error = new Error("JSON add failed");

			mockAddBytes.mockRejectedValue(error);

			await expect(service.addJson(testObject)).rejects.toThrow(IpfsError);
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

		it("должен закрепить файл используя pins.add", async () => {
			const testCid = "QmPin";
			mockPinsAdd.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					yield {} as CID;
				},
			});

			await service.pin(testCid);

			expect(mockPinsAdd).toHaveBeenCalled();
			expect(loggerService.log).toHaveBeenCalledWith(expect.stringMatching(/File pinned/));
		});

		it("должен использовать fallback если pins.add не функция", async () => {
			const testCid = "QmPinFallback";
			service["helia"].pins = { add: null, rm: mockPinsRm } as unknown as Helia["pins"];
			mockStat.mockResolvedValue({});

			await service.pin(testCid);

			expect(mockStat).toHaveBeenCalled();
		});

		it("должен использовать fallback если pins отсутствует", async () => {
			const testCid = "QmPinNoPins";
			service["helia"].pins = undefined as unknown as Helia["pins"];
			mockStat.mockResolvedValue({});

			await service.pin(testCid);

			expect(mockStat).toHaveBeenCalled();
		});

		it("должен обработать ошибку при pin", async () => {
			const testCid = "QmPinError";
			const error = new Error("Pin error");
			// Мокируем withRetry чтобы ошибка попала в catch блок напрямую
			service["withRetry"] = jest.fn().mockRejectedValue(error);
			mockPinsAdd.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					throw error;
				},
			});

			await expect(service.pin(testCid)).rejects.toThrow(IpfsError);
		});

		it("должен обработать ошибку при pin через stat fallback", async () => {
			const testCid = "QmPinErrorMetrics";
			service["helia"].pins = undefined as unknown as Helia["pins"];
			service["fs"].stat = jest.fn().mockRejectedValue(new Error("Stat error"));

			await expect(service.pin(testCid)).rejects.toThrow(IpfsError);
		});
	});

	describe("unpin", () => {
		beforeEach(async () => {
			await service.onModuleInit();
		});

		it("должен открепить файл используя pins.rm", async () => {
			const testCid = "QmUnpin";
			// Убеждаемся, что pins.rm доступен
			service["helia"].pins = {
				add: mockPinsAdd,
				rm: mockPinsRm,
			} as unknown as Helia["pins"];
			mockPinsRm.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					yield {} as CID;
				},
			});

			await service.unpin(testCid);

			expect(mockPinsRm).toHaveBeenCalled();
			expect(loggerService.log).toHaveBeenCalledWith(expect.stringMatching(/File unpinned/));
		});

		it("должен обработать случай когда pins.rm не функция", async () => {
			const testCid = "QmUnpinNoRm";
			service["helia"].pins = { add: mockPinsAdd, rm: null } as unknown as Helia["pins"];

			await service.unpin(testCid);

			expect(loggerService.log).toHaveBeenCalledWith(expect.stringMatching(/File unpinned/));
		});

		it("должен обработать случай когда pins отсутствует", async () => {
			const testCid = "QmUnpinNoPins";
			service["helia"].pins = undefined as unknown as Helia["pins"];

			await service.unpin(testCid);

			expect(loggerService.log).toHaveBeenCalledWith(expect.stringMatching(/File unpinned/));
		});

		it("должен обработать ошибку при unpin", async () => {
			const testCid = "QmUnpinError";
			const error = new Error("Unpin error");
			// Убеждаемся, что pins.rm доступен
			service["helia"].pins = {
				add: mockPinsAdd,
				rm: mockPinsRm,
			} as unknown as Helia["pins"];
			mockPinsRm.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					throw error;
				},
			});

			await expect(service.unpin(testCid)).rejects.toThrow(IpfsError);
		});

		it("должен обработать ошибку при unpin и залогировать метрики", async () => {
			const testCid = "QmUnpinErrorMetrics";
			// Используем withRetry чтобы вызвать ошибку в catch блоке
			service["withRetry"] = jest.fn().mockRejectedValue(new Error("Unpin error"));

			await expect(service.unpin(testCid)).rejects.toThrow(IpfsError);
		});
	});

	describe("healthCheck", () => {
		it("должен вернуть false если сервис не инициализирован", async () => {
			service["isInitialized"] = false;
			const result = await service.healthCheck();

			expect(result).toBe(false);
		});

		it("должен вернуть false если helia не инициализирован", async () => {
			service["isInitialized"] = true;
			service["helia"] = undefined as unknown as Helia;
			const result = await service.healthCheck();

			expect(result).toBe(false);
		});

		it("должен вернуть true если все инициализировано", async () => {
			await service.onModuleInit();
			const result = await service.healthCheck();

			expect(result).toBe(true);
		});

		it("должен вернуть false при ошибке в healthCheck", async () => {
			await service.onModuleInit();
			service["withTimeout"] = jest.fn().mockRejectedValue(new Error("Timeout error"));

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
			service["helia"] = undefined as unknown as Helia;

			expect(() => service["ensureInitialized"]()).toThrow(IpfsError);
		});
	});

	describe("onModuleInit", () => {
		it("должен работать с массивом URL", async () => {
			const configWithArray: IpfsConfig = {
				url: ["http://localhost:5001", "http://localhost:5002"],
			};

			const serviceWithArray = new IpfsCoreService(configWithArray, loggerService);
			await serviceWithArray.onModuleInit();

			expect(trustlessGateway).toHaveBeenCalledWith({
				gateways: configWithArray.url,
			});
		});

		it("должен использовать heliaOptions из конфига", async () => {
			const configWithOptions: IpfsConfig = {
				url: "http://localhost:5001",
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
