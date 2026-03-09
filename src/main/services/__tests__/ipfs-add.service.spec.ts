import { LoggerService } from "@makebelieve21213-packages/logger";
import { Test } from "@nestjs/testing";
import IpfsError from "src/errors/ipfs.error";
import HeliaClientService from "src/main/services/helia-client.service";
import IpfsAddService from "src/main/services/ipfs-add.service";
import IpfsCoreInternalService from "src/main/services/ipfs-core-internal.service";
import { IpfsErrorType } from "src/types/ipfs-error.types";

describe("IpfsAddService", () => {
	let service: IpfsAddService;
	let heliaClient: jest.Mocked<HeliaClientService>;
	let core: jest.Mocked<IpfsCoreInternalService>;
	let logger: jest.Mocked<LoggerService>;
	let fetchMock: jest.SpyInstance;

	const mockKuboUrl = "http://localhost:5001/api/v0";

	beforeEach(async () => {
		jest.clearAllMocks();
		fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
			ok: true,
			json: async () => ({ Hash: "QmTest123" }),
		} as Response);

		heliaClient = {
			kuboApiUrl: mockKuboUrl,
			ensureInitialized: jest.fn(),
		} as unknown as jest.Mocked<HeliaClientService>;

		core = {
			ensureInitialized: jest.fn(),
			validateDataSize: jest.fn(),
			withRetry: jest.fn(async (fn: () => Promise<unknown>) => fn()),
			logMetrics: jest.fn(),
		} as unknown as jest.Mocked<IpfsCoreInternalService>;

		logger = {
			setContext: jest.fn(),
			log: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
		} as unknown as jest.Mocked<LoggerService>;

		const module = await Test.createTestingModule({
			providers: [
				IpfsAddService,
				{ provide: HeliaClientService, useValue: heliaClient },
				{ provide: IpfsCoreInternalService, useValue: core },
				{ provide: LoggerService, useValue: logger },
			],
		}).compile();

		service = module.get(IpfsAddService);
	});

	afterEach(() => {
		fetchMock?.mockRestore();
	});

	it("должен установить контекст логгера при создании", () => {
		expect(logger.setContext).toHaveBeenCalledWith("IpfsAddService");
	});

	it("должен создаваться через конструктор с инжектированными зависимостями", () => {
		const addService = new IpfsAddService(heliaClient, core, logger);
		expect(addService).toBeInstanceOf(IpfsAddService);
		expect(logger.setContext).toHaveBeenCalledWith("IpfsAddService");
	});

	describe("addFile", () => {
		it("должен выбросить ошибку при неинициализированном core", async () => {
			core.ensureInitialized.mockImplementation(() => {
				throw new IpfsError("Not initialized", IpfsErrorType.INITIALIZATION);
			});

			await expect(service.addFile("test")).rejects.toThrow(IpfsError);
		});

		it("должен выбросить ошибку при неинициализированном helia", async () => {
			heliaClient.ensureInitialized.mockImplementation(() => {
				throw new IpfsError("Not initialized", IpfsErrorType.INITIALIZATION);
			});

			await expect(service.addFile("test")).rejects.toThrow(IpfsError);
		});

		it("должен выбросить IpfsError при пустых данных (Uint8Array)", async () => {
			await expect(service.addFile(new Uint8Array(0))).rejects.toThrow(IpfsError);
			await expect(service.addFile(new Uint8Array(0))).rejects.toMatchObject({
				errorType: IpfsErrorType.VALIDATION,
			});
		});

		it("должен выбросить IpfsError при пустой строке", async () => {
			await expect(service.addFile("")).rejects.toThrow(IpfsError);
		});

		it("должен успешно добавить строку и вернуть CID", async () => {
			const result = await service.addFile("test data");

			expect(result).toBe("QmTest123");
			expect(core.ensureInitialized).toHaveBeenCalled();
			expect(heliaClient.ensureInitialized).toHaveBeenCalled();
			expect(core.validateDataSize).toHaveBeenCalled();
			expect(core.withRetry).toHaveBeenCalled();
			expect(core.logMetrics).toHaveBeenCalledWith("addFile", expect.any(Number), 9, true);
			expect(logger.log).toHaveBeenCalledWith(
				expect.stringContaining("File added to IPFS - cid: QmTest123")
			);
		});

		it("должен успешно добавить Uint8Array и вернуть CID", async () => {
			const data = new TextEncoder().encode("binary data");
			const result = await service.addFile(data);

			expect(result).toBe("QmTest123");
			expect(core.validateDataSize).toHaveBeenCalledWith(data);
		});

		it("должен логировать метрики при ошибке addFile", async () => {
			core.withRetry.mockRejectedValue(new Error("Kubo /add failed"));

			await expect(service.addFile("test")).rejects.toThrow(IpfsError);
			expect(core.logMetrics).toHaveBeenCalledWith("addFile", expect.any(Number), 4, false);
		});

		it("должен обернуть ошибку в IpfsError при провале fetch", async () => {
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => "Internal Server Error",
			} as Response);

			const err = await service.addFile("test").catch((e) => e);
			expect(err).toBeInstanceOf(IpfsError);
			expect(err.errorType).toBe(IpfsErrorType.OPERATION);
		});

		it("должен вызывать validateDataSize с корректным размером", async () => {
			const data = new Uint8Array([1, 2, 3]);
			await service.addFile(data);

			expect(core.validateDataSize).toHaveBeenCalledWith(data);
		});
	});

	describe("addJson", () => {
		it("должен выбросить IpfsError при пустом объекте", async () => {
			await expect(service.addJson({})).rejects.toThrow(IpfsError);
			await expect(service.addJson({})).rejects.toMatchObject({
				errorType: IpfsErrorType.VALIDATION,
			});
		});

		it("должен выбросить IpfsError при null", async () => {
			await expect(service.addJson(null as unknown as object)).rejects.toThrow(IpfsError);
		});

		it("должен выбросить IpfsError при не объекте", async () => {
			await expect(service.addJson("string" as unknown as object)).rejects.toThrow(IpfsError);
		});

		it("должен успешно добавить JSON и вернуть CID", async () => {
			const obj = { foo: "bar", num: 42 };
			const result = await service.addJson(obj);

			expect(result).toBe("QmTest123");
			expect(core.validateDataSize).toHaveBeenCalled();
			expect(core.withRetry).toHaveBeenCalled();
		});

		it("должен вызвать addFile с сериализованным JSON", async () => {
			const obj = { key: "value" };
			const addFileSpy = jest.spyOn(service, "addFile");

			await service.addJson(obj);

			expect(addFileSpy).toHaveBeenCalledWith(expect.any(Buffer));
			const buffer = addFileSpy.mock.calls[0][0] as Buffer;
			expect(JSON.parse(buffer.toString())).toEqual(obj);
		});

		it("должен валидировать размер при addJson", async () => {
			const obj = { large: "x".repeat(100) };
			await service.addJson(obj);

			expect(core.validateDataSize).toHaveBeenCalled();
		});
	});
});
