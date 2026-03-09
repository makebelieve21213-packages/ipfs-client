import { Buffer } from "buffer";

import { LoggerModule, LoggerService } from "@makebelieve21213-packages/logger";
import { Test } from "@nestjs/testing";
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
import IpfsCoreModule from "src/main/ipfs-core.module";
import IpfsCoreService from "src/main/ipfs-core.service";
import HeliaClientService from "src/main/services/helia-client.service";
import IpfsCoreInternalService from "src/main/services/ipfs-core-internal.service";
import IpfsReadService from "src/main/services/ipfs-read.service";
import { IpfsErrorType } from "src/types/ipfs-error.types";

import type { TestingModule } from "@nestjs/testing";
import type IpfsConfig from "src/types/ipfs-config";

const KUBO_API_URL = "http://localhost:5001/api/v0";

describe("IpfsCoreService", () => {
	let service: IpfsCoreService;
	let module: TestingModule;
	let loggerService: jest.Mocked<LoggerService>;
	let fetchMock: jest.SpyInstance;
	const mockConfig: IpfsConfig = { url: KUBO_API_URL };

	beforeEach(async () => {
		jest.clearAllMocks();

		fetchMock = jest
			.spyOn(global, "fetch")
			.mockImplementation(async (...args: Parameters<typeof fetch>) => {
				const input = args[0];
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.toString()
							: (input as Request).url;
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

		module = await Test.createTestingModule({
			imports: [
				LoggerModule,
				IpfsCoreModule.forRootAsync({
					useFactory: () => mockConfig,
					inject: [],
				}),
			],
		}).compile();

		await module.init();

		service = module.get<IpfsCoreService>(IpfsCoreService);
		const logger = module.get<LoggerService>(LoggerService);
		loggerService = logger as jest.Mocked<LoggerService>;
	});

	afterEach(async () => {
		fetchMock?.mockRestore();
		await module?.close();
		jest.clearAllMocks();
	});

	describe("constructor", () => {
		it("должен корректно инициализироваться через модуль", () => {
			expect(service).toBeDefined();
			expect(service.addFile).toBeDefined();
			expect(service.getFile).toBeDefined();
		});

		it("должен создать экземпляр IpfsCoreService", () => {
			expect(service).toBeInstanceOf(IpfsCoreService);
		});
	});

	describe("onModuleInit", () => {
		it("должен проверить Kubo API и создать IPFS клиент с правильным URL", async () => {
			const heliaClient = module.get<HeliaClientService>(HeliaClientService);

			expect(fetchMock).toHaveBeenCalledWith(
				`${KUBO_API_URL}/id`,
				expect.objectContaining({ method: "POST" })
			);
			expect(trustlessGateway).toHaveBeenCalledWith({
				gateways: [mockConfig.url],
			});
			expect(createHeliaHTTP).toHaveBeenCalled();
			expect(unixfs).toHaveBeenCalledWith(mockHelia);
			expect(heliaClient.heliaInstance).toBe(mockHelia);
			expect(heliaClient.kuboApiUrl).toBe(KUBO_API_URL);
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

			await module.close();
			module = await Test.createTestingModule({
				imports: [
					LoggerModule,
					IpfsCoreModule.forRootAsync({
						useFactory: () => mockConfig,
						inject: [],
					}),
				],
			}).compile();
			await module.init();

			const logger = module.get<LoggerService>(LoggerService);
			expect((logger as jest.Mocked<LoggerService>).log).toHaveBeenCalledWith(
				expect.stringMatching(/peerId: unknown, url:/)
			);
		});

		it("должен обработать ошибку при инициализации и выбросить IpfsError", async () => {
			createHeliaHTTP.mockRejectedValue(new Error("Connection failed"));

			await expect(
				Test.createTestingModule({
					imports: [
						LoggerModule,
						IpfsCoreModule.forRootAsync({
							useFactory: () => mockConfig,
							inject: [],
						}),
					],
				})
					.compile()
					.then((m) => m.init())
			).rejects.toThrow(IpfsError);
		});

		it("должен обработать ошибку Kubo API при инициализации", async () => {
			fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as Response);

			await expect(
				Test.createTestingModule({
					imports: [
						LoggerModule,
						IpfsCoreModule.forRootAsync({
							useFactory: () => mockConfig,
							inject: [],
						}),
					],
				})
					.compile()
					.then((m) => m.init())
			).rejects.toThrow(IpfsError);
		});
	});

	describe("onModuleDestroy", () => {
		it("должен остановить IPFS клиент", async () => {
			await module.close();

			expect(mockStop).toHaveBeenCalled();
		});

		it("должен обработать ошибку при остановке и залогировать её", async () => {
			mockStop.mockRejectedValue(new Error("Stop failed"));

			await module.close();
			expect(loggerService.error).toHaveBeenCalled();
		});

		it("должен обработать ошибку остановки с не-Error объектом", async () => {
			mockStop.mockRejectedValue({ code: 500, message: "Server error" });

			await module.close();
			expect(loggerService.error).toHaveBeenCalledWith(
				expect.stringContaining("Failed to stop IPFS Helia client - error: [object Object]")
			);
		});
	});

	describe("addFile", () => {
		it("должен добавить строку в IPFS через Kubo API и вернуть CID", async () => {
			const result = await service.addFile("Hello, IPFS!");

			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining("/add?pin=true&cid-version=1"),
				expect.objectContaining({ method: "POST" })
			);
			expect(result).toBe("mockedCID");
		});

		it("должен добавить Uint8Array в IPFS через Kubo API и вернуть CID", async () => {
			const result = await service.addFile(new Uint8Array([1, 2, 3, 4, 5]));

			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining("/add"),
				expect.objectContaining({ method: "POST", body: expect.any(FormData) })
			);
			expect(result).toBe("mockedCID");
		});

		it("должен передавать ошибки от Kubo API", async () => {
			const core = module.get<IpfsCoreInternalService>(IpfsCoreInternalService);
			core["config"].retry = { maxAttempts: 1, delay: 0 };
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				text: async () => "Internal Server Error",
			} as Response);

			await expect(service.addFile("test")).rejects.toThrow(IpfsError);
		});

		it("должен выбросить ошибку при превышении maxFileSize", async () => {
			const configWithLimit: IpfsConfig = { ...mockConfig, maxFileSize: 10 };
			const limitModule = await Test.createTestingModule({
				imports: [
					LoggerModule,
					IpfsCoreModule.forRootAsync({
						useFactory: () => configWithLimit,
						inject: [],
					}),
				],
			}).compile();
			await limitModule.init();
			const limitService = limitModule.get<IpfsCoreService>(IpfsCoreService);

			await expect(limitService.addFile(new Uint8Array(100))).rejects.toThrow(IpfsError);
			expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/add"), expect.any(Object));

			await limitModule.close();
		});
	});

	describe("addJson", () => {
		it("должен добавить простой объект в IPFS через addFile", async () => {
			const result = await service.addJson({ name: "test", value: 123 });

			expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/add"), expect.any(Object));
			expect(result).toBe("mockedCID");
		});

		it("должен передавать ошибки от Kubo API при добавлении JSON", async () => {
			const core = module.get<IpfsCoreInternalService>(IpfsCoreInternalService);
			core["config"].retry = { maxAttempts: 1, delay: 0 };
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				text: async () => "Add failed",
			} as Response);

			await expect(service.addJson({ test: "data" })).rejects.toThrow(IpfsError);
		});

		it("должен выбросить ошибку при пустом объекте", async () => {
			await expect(service.addJson({})).rejects.toThrow(IpfsError);
		});

		it("должен выбросить ошибку при null", async () => {
			await expect(service.addJson(null as unknown as object)).rejects.toThrow(IpfsError);
		});
	});

	describe("getFile", () => {
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
			mockCat.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					throw new Error("File error");
				},
			});

			await expect(service.getFile(testCid)).rejects.toThrow(IpfsError);
		});

		it("должен получить файл из кэша если он там есть", async () => {
			const testCid = "QmCachedFile";
			const cachedBuffer = Buffer.from("cached data");
			const core = module.get<IpfsCoreInternalService>(IpfsCoreInternalService);
			await core.setCache(`file:${testCid}`, cachedBuffer);

			const result = await service.getFile(testCid);

			expect(result).toEqual(cachedBuffer);
			expect(loggerService.log).toHaveBeenCalledWith(`File retrieved from cache - cid: ${testCid}`);
			expect(mockCat).not.toHaveBeenCalled();
		});

		it("должен выбросить IpfsError с типом NOT_FOUND при ошибке 'not found'", async () => {
			const testCid = "QmNotFound";
			const readService = module.get<IpfsReadService>(IpfsReadService);
			jest.spyOn(readService["core"], "withRetry").mockRejectedValue(new Error("not found"));

			try {
				await service.getFile(testCid);
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(IpfsError);
				expect((e as IpfsError).errorType).toBe(IpfsErrorType.NOT_FOUND);
			}
		});

		it("должен выбросить ошибку при пустых данных", async () => {
			await expect(service.addFile("")).rejects.toThrow(IpfsError);
		});

		it("должен выбросить ошибку при пустом Uint8Array", async () => {
			await expect(service.addFile(new Uint8Array(0))).rejects.toThrow(IpfsError);
		});
	});

	describe("getFileStream", () => {
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
			mockCat.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					throw new Error("not found");
				},
			});

			await expect(async () => {
				for await (const _ of service.getFileStream(testCid)) {
					// consume
				}
			}).rejects.toThrow(IpfsError);
		});

		it("должен обработать другую ошибку в getFileStream", async () => {
			const testCid = "QmStreamError";
			mockCat.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					throw new Error("stream error");
				},
			});

			await expect(async () => {
				for await (const _ of service.getFileStream(testCid)) {
					// consume
				}
			}).rejects.toThrow(IpfsError);
		});
	});

	describe("getJson", () => {
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
			mockCat.mockReturnValue({
				[Symbol.asyncIterator]: async function* () {
					yield new Uint8Array(Buffer.from("invalid json"));
				},
			});

			await expect(service.getJson(testCid)).rejects.toThrow(IpfsError);
		});
	});

	describe("exists", () => {
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
			const core = module.get<IpfsCoreInternalService>(IpfsCoreInternalService);
			core["config"].retry = { maxAttempts: 1, delay: 0 };
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				text: async () => "Pin error",
			} as Response);

			await expect(service.pin(testCid)).rejects.toThrow(IpfsError);
		});
	});

	describe("unpin", () => {
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
			const core = module.get<IpfsCoreInternalService>(IpfsCoreInternalService);
			core["config"].retry = { maxAttempts: 1, delay: 0 };
			fetchMock.mockResolvedValue({
				ok: false,
				status: 500,
				text: async () => "Unpin error",
			} as Response);

			await expect(service.unpin(testCid)).rejects.toThrow(IpfsError);
		});

		it("должен не выбрасывать ошибку при 'not pinned'", async () => {
			const testCid = "QmUnpinNotPinned";
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => "not pinned",
			} as Response);

			await expect(service.unpin(testCid)).resolves.not.toThrow();
		});
	});

	describe("healthCheck", () => {
		it("должен вернуть false если сервис не инициализирован", async () => {
			const core = module.get<IpfsCoreInternalService>(IpfsCoreInternalService);
			core.isInitialized = false;

			const result = await service.healthCheck();

			expect(result).toBe(false);
		});

		it("должен вернуть false если kuboApiUrl не инициализирован", async () => {
			const heliaClient = module.get<HeliaClientService>(HeliaClientService);
			Object.defineProperty(heliaClient, "kuboApiUrl", { value: "", configurable: true });

			const result = await service.healthCheck();

			expect(result).toBe(false);
		});

		it("должен вернуть true если Kubo API доступен", async () => {
			const result = await service.healthCheck();

			expect(fetchMock).toHaveBeenCalledWith(
				`${KUBO_API_URL}/id`,
				expect.objectContaining({ method: "POST" })
			);
			expect(result).toBe(true);
		});

		it("должен вернуть false при ошибке Kubo API", async () => {
			fetchMock.mockResolvedValueOnce({ ok: false } as Response);

			const result = await service.healthCheck();

			expect(result).toBe(false);
		});

		it("должен вернуть false при сетевой ошибке", async () => {
			fetchMock.mockRejectedValueOnce(new Error("Network error"));

			const result = await service.healthCheck();

			expect(result).toBe(false);
		});
	});

	describe("getFileMetadata", () => {
		it("должен получить метаданные файла с fileSize", async () => {
			const testCid = "QmMetadata";
			mockStat.mockResolvedValue({ fileSize: BigInt(1024) });

			const result = await service.getFileMetadata(testCid);

			expect(result.size).toBe(1024);
			expect(result.cid).toBe(testCid);
			expect(loggerService.log).toHaveBeenCalledWith(expect.stringMatching(/File metadata retrieved/));
		});

		it("должен получить метаданные файла с size", async () => {
			const testCid = "QmMetadataSize";
			mockStat.mockResolvedValue({ size: 2048 });

			const result = await service.getFileMetadata(testCid);

			expect(result.size).toBe(2048);
			expect(result.cid).toBe(testCid);
		});

		it("должен использовать 0 если размер не указан", async () => {
			const testCid = "QmMetadataNoSize";
			mockStat.mockResolvedValue({});

			const result = await service.getFileMetadata(testCid);

			expect(result.size).toBe(0);
		});

		it("должен выбросить IpfsError с типом NOT_FOUND при ошибке 'not found'", async () => {
			const testCid = "QmMetadataNotFound";
			mockStat.mockRejectedValue(new Error("not found"));

			const core = module.get<IpfsCoreInternalService>(IpfsCoreInternalService);
			core["config"].retry = { maxAttempts: 1, delay: 0 };

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
			const readService = module.get<IpfsReadService>(IpfsReadService);
			jest.spyOn(readService["core"], "withRetry").mockRejectedValue(ipfsError);

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
			const readService = module.get<IpfsReadService>(IpfsReadService);
			jest.spyOn(readService["core"], "withRetry").mockRejectedValue(new Error("connection timeout"));

			try {
				await service.getFileMetadata(testCid);
				expect(true).toBe(false);
			} catch (e) {
				expect(e).toBeInstanceOf(IpfsError);
				expect((e as IpfsError).errorType).toBe(IpfsErrorType.OPERATION);
				expect((e as IpfsError).message).toBe(`Failed to get file metadata: ${testCid}`);
			}
		});
	});

	describe("onModuleInit (config variants)", () => {
		it("должен работать с массивом URL", async () => {
			const configWithArray: IpfsConfig = {
				url: [KUBO_API_URL, "http://localhost:5002/api/v0"],
			};

			const arrayModule = await Test.createTestingModule({
				imports: [
					LoggerModule,
					IpfsCoreModule.forRootAsync({
						useFactory: () => configWithArray,
						inject: [],
					}),
				],
			}).compile();
			await arrayModule.init();

			const heliaClient = arrayModule.get<HeliaClientService>(HeliaClientService);
			expect(heliaClient.kuboApiUrl).toBe(KUBO_API_URL);
			expect(trustlessGateway).toHaveBeenCalledWith({
				gateways: configWithArray.url,
			});

			await arrayModule.close();
		});

		it("должен использовать heliaOptions из конфига", async () => {
			const configWithOptions: IpfsConfig = {
				url: KUBO_API_URL,
				heliaOptions: {},
			};

			const optionsModule = await Test.createTestingModule({
				imports: [
					LoggerModule,
					IpfsCoreModule.forRootAsync({
						useFactory: () => configWithOptions,
						inject: [],
					}),
				],
			}).compile();
			await optionsModule.init();

			expect(createHeliaHTTP).toHaveBeenCalled();

			await optionsModule.close();
		});
	});
});
