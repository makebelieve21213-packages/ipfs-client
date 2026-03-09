import { LoggerService } from "@makebelieve21213-packages/logger";
import { Test } from "@nestjs/testing";
import { CID } from "multiformats";
import { mockCat, mockStat } from "src/__tests__/__mocks__/helia";
import IpfsError from "src/errors/ipfs.error";
import HeliaClientService from "src/main/services/helia-client.service";
import IpfsCoreInternalService from "src/main/services/ipfs-core-internal.service";
import IpfsReadService from "src/main/services/ipfs-read.service";
import { IpfsErrorType } from "src/types/ipfs-error.types";

describe("IpfsReadService", () => {
	let service: IpfsReadService;
	let heliaClient: jest.Mocked<
		Pick<HeliaClientService, "ensureInitialized" | "kuboApiUrl" | "fsInstance">
	>;
	let core: jest.Mocked<
		Pick<
			IpfsCoreInternalService,
			"ensureInitialized" | "validateCid" | "withRetry" | "logMetrics" | "getFromCache" | "setCache"
		>
	>;
	let logger: jest.Mocked<LoggerService>;

	const validCid = "QmTest123";
	const mockCid = CID.parse(validCid);

	beforeEach(async () => {
		jest.clearAllMocks();

		const mockFs = {
			cat: mockCat,
			stat: mockStat,
		};

		heliaClient = {
			ensureInitialized: jest.fn(),
			kuboApiUrl: "http://localhost:5001",
			fsInstance: mockFs,
		} as never;

		core = {
			ensureInitialized: jest.fn(),
			validateCid: jest.fn().mockReturnValue(mockCid),
			withRetry: jest.fn(async (fn: () => Promise<unknown>) => fn()),
			logMetrics: jest.fn(),
			getFromCache: jest.fn().mockResolvedValue(null),
			setCache: jest.fn().mockResolvedValue(undefined),
		} as never;

		logger = {
			setContext: jest.fn(),
			log: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
		} as never;

		mockCat.mockReturnValue({
			[Symbol.asyncIterator]: async function* () {
				yield new Uint8Array([1, 2, 3]);
			},
		});

		mockStat.mockResolvedValue({ fileSize: 3, size: 3 });

		const module = await Test.createTestingModule({
			providers: [
				IpfsReadService,
				{ provide: HeliaClientService, useValue: heliaClient },
				{ provide: IpfsCoreInternalService, useValue: core },
				{ provide: LoggerService, useValue: logger },
			],
		}).compile();

		service = module.get(IpfsReadService);
	});

	it("должен установить контекст логгера при создании", () => {
		expect(logger.setContext).toHaveBeenCalledWith("IpfsReadService");
	});

	describe("getFile", () => {
		it("должен выбросить ошибку при неинициализированном core", async () => {
			core.ensureInitialized.mockImplementation(() => {
				throw new IpfsError("Not initialized", IpfsErrorType.INITIALIZATION);
			});

			await expect(service.getFile(validCid)).rejects.toThrow(IpfsError);
		});

		it("должен вернуть данные из кэша если есть", async () => {
			const cached = Buffer.from([1, 2, 3]);
			core.getFromCache.mockResolvedValueOnce(cached);

			const result = await service.getFile(validCid);

			expect(result).toEqual(cached);
			expect(core.getFromCache).toHaveBeenCalledWith(`file:${validCid}`);
			expect(core.withRetry).not.toHaveBeenCalled();
			expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("File retrieved from cache"));
		});

		it("должен получить файл из IPFS и закэшировать", async () => {
			const result = await service.getFile(validCid);

			expect(result).toEqual(Buffer.from([1, 2, 3]));
			expect(core.validateCid).toHaveBeenCalledWith(validCid);
			expect(core.withRetry).toHaveBeenCalled();
			expect(core.setCache).toHaveBeenCalledWith(`file:${validCid}`, expect.any(Buffer));
			expect(core.logMetrics).toHaveBeenCalledWith("getFile", expect.any(Number), 3, true);
			expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("File retrieved from IPFS"));
		});

		it("должен выбросить IpfsError NOT_FOUND при not found", async () => {
			mockCat.mockReturnValueOnce({
				[Symbol.asyncIterator]: async function* () {
					throw new Error("block not found");
				},
			});

			const err = await service.getFile(validCid).catch((e) => e);
			expect(err).toBeInstanceOf(IpfsError);
			expect(err.errorType).toBe(IpfsErrorType.NOT_FOUND);
			expect(core.logMetrics).toHaveBeenCalledWith("getFile", expect.any(Number), undefined, false);
		});

		it("должен выбросить IpfsError OPERATION при другой ошибке", async () => {
			mockCat.mockReturnValueOnce({
				[Symbol.asyncIterator]: async function* () {
					throw new Error("Network error");
				},
			});

			const err = await service.getFile(validCid).catch((e) => e);
			expect(err).toBeInstanceOf(IpfsError);
			expect(err.errorType).toBe(IpfsErrorType.OPERATION);
		});

		it("должен собирать несколько чанков в один buffer", async () => {
			mockCat.mockReturnValueOnce({
				[Symbol.asyncIterator]: async function* () {
					yield new Uint8Array([1]);
					yield new Uint8Array([2]);
					yield new Uint8Array([3]);
				},
			});

			const result = await service.getFile(validCid);
			expect(result).toEqual(Buffer.from([1, 2, 3]));
		});
	});

	describe("getFileStream", () => {
		it("должен проверять инициализацию", async () => {
			core.ensureInitialized.mockImplementation(() => {
				throw new IpfsError("Not initialized", IpfsErrorType.INITIALIZATION);
			});

			const stream = service.getFileStream(validCid);
			const iterator = stream[Symbol.asyncIterator]();
			await expect(iterator.next()).rejects.toThrow(IpfsError);
		});

		it("должен стримить чанки", async () => {
			const chunks: Uint8Array[] = [];
			for await (const chunk of service.getFileStream(validCid)) {
				chunks.push(chunk);
			}
			expect(chunks).toEqual([new Uint8Array([1, 2, 3])]);
		});

		it("должен выбросить NOT_FOUND при not found в stream", async () => {
			mockCat.mockReturnValueOnce({
				[Symbol.asyncIterator]: async function* () {
					throw new Error("block not found");
				},
			});

			const stream = service.getFileStream(validCid);
			const iterator = stream[Symbol.asyncIterator]();
			await expect(iterator.next()).rejects.toMatchObject({
				errorType: IpfsErrorType.NOT_FOUND,
			});
		});

		it("должен выбросить OPERATION при другой ошибке в stream", async () => {
			mockCat.mockReturnValueOnce({
				[Symbol.asyncIterator]: async function* () {
					throw new Error("Unknown error");
				},
			});

			const stream = service.getFileStream(validCid);
			const iterator = stream[Symbol.asyncIterator]();
			await expect(iterator.next()).rejects.toMatchObject({
				errorType: IpfsErrorType.OPERATION,
			});
		});
	});

	describe("getJson", () => {
		it("должен парсить JSON и вернуть объект", async () => {
			const jsonObj = { foo: "bar", num: 42 };
			core.getFromCache.mockResolvedValueOnce(null);
			mockCat.mockReturnValueOnce({
				[Symbol.asyncIterator]: async function* () {
					yield new TextEncoder().encode(JSON.stringify(jsonObj));
				},
			});

			const result = await service.getJson<typeof jsonObj>(validCid);
			expect(result).toEqual(jsonObj);
		});

		it("должен выбросить IpfsError при невалидном JSON", async () => {
			core.getFromCache.mockResolvedValueOnce(null);
			mockCat.mockReturnValueOnce({
				[Symbol.asyncIterator]: async function* () {
					yield new TextEncoder().encode("not valid json {{{");
				},
			});

			const err = (await service.getJson(validCid).catch((e) => e)) as IpfsError;
			expect(err).toBeInstanceOf(IpfsError);
			expect(err.errorType).toBe(IpfsErrorType.VALIDATION);
		});

		it("должен использовать getFile", async () => {
			const getFileSpy = jest
				.spyOn(service, "getFile")
				.mockResolvedValue(Buffer.from(JSON.stringify({ data: 1 })));

			const result = await service.getJson(validCid);
			expect(getFileSpy).toHaveBeenCalledWith(validCid);
			expect(result).toEqual({ data: 1 });
		});
	});

	describe("exists", () => {
		it("должен вернуть true если файл существует", async () => {
			mockStat.mockResolvedValueOnce({ size: 10 });

			const result = await service.exists(validCid);
			expect(result).toBe(true);
		});

		it("должен вернуть false если файл не найден", async () => {
			mockStat.mockRejectedValueOnce(new Error("not found"));

			const result = await service.exists(validCid);
			expect(result).toBe(false);
		});

		it("должен вызвать validateCid", async () => {
			await service.exists(validCid);
			expect(core.validateCid).toHaveBeenCalledWith(validCid);
		});
	});

	describe("getFileMetadata", () => {
		it("должен вернуть метаданные с fileSize", async () => {
			mockStat.mockResolvedValueOnce({ fileSize: 100 });

			const result = await service.getFileMetadata(validCid);

			expect(result).toEqual({ size: 100, cid: validCid });
			expect(core.logMetrics).toHaveBeenCalledWith(
				"getFileMetadata",
				expect.any(Number),
				undefined,
				true
			);
		});

		it("должен вернуть метаданные с size когда fileSize отсутствует", async () => {
			mockStat.mockResolvedValueOnce({ size: 50 });

			const result = await service.getFileMetadata(validCid);
			expect(result).toEqual({ size: 50, cid: validCid });
		});

		it("должен обработать bigint size", async () => {
			mockStat.mockResolvedValueOnce({ fileSize: BigInt(200) });

			const result = await service.getFileMetadata(validCid);
			expect(result).toEqual({ size: 200, cid: validCid });
		});

		it("должен выбросить NOT_FOUND при not found", async () => {
			mockStat.mockRejectedValueOnce(new Error("block not found"));

			const err = await service.getFileMetadata(validCid).catch((e) => e);
			expect(err).toBeInstanceOf(IpfsError);
			expect(err.errorType).toBe(IpfsErrorType.NOT_FOUND);
		});

		it("должен выбросить NOT_FOUND когда originalError содержит not found", async () => {
			const ipfsErr = new IpfsError(
				"wrapped",
				IpfsErrorType.OPERATION,
				undefined,
				new Error("block not found")
			);
			core.withRetry.mockRejectedValueOnce(ipfsErr);

			const err = await service.getFileMetadata(validCid).catch((e) => e);
			expect(err).toBeInstanceOf(IpfsError);
			expect(err.errorType).toBe(IpfsErrorType.NOT_FOUND);
		});

		it("должен выбросить OPERATION при другой ошибке", async () => {
			mockStat.mockRejectedValueOnce(new Error("Network error"));

			const err = await service.getFileMetadata(validCid).catch((e) => e);
			expect(err).toBeInstanceOf(IpfsError);
			expect(err.errorType).toBe(IpfsErrorType.OPERATION);
		});

		it("должен обработать IpfsError с originalError не Error (String)", async () => {
			const ipfsErr = new IpfsError(
				"wrapped",
				IpfsErrorType.OPERATION,
				undefined,
				"block not found" as unknown as Error
			);
			core.withRetry.mockRejectedValueOnce(ipfsErr);

			const err = await service.getFileMetadata(validCid).catch((e) => e);
			expect(err).toBeInstanceOf(IpfsError);
			expect(err.errorType).toBe(IpfsErrorType.NOT_FOUND);
		});

		it("должен обработать error не Error в getFileMetadata", async () => {
			core.withRetry.mockRejectedValueOnce("raw string error");

			const err = await service.getFileMetadata(validCid).catch((e) => e);
			expect(err).toBeInstanceOf(IpfsError);
			expect(err.errorType).toBe(IpfsErrorType.OPERATION);
		});

		it("должен использовать originalError || error когда originalError falsy", async () => {
			const ipfsErr = new IpfsError("wrapped", IpfsErrorType.OPERATION, undefined, undefined);
			core.withRetry.mockRejectedValueOnce(ipfsErr);

			const err = await service.getFileMetadata(validCid).catch((e) => e);
			expect(err).toBeInstanceOf(IpfsError);
		});
	});
});
