import { LoggerService } from "@makebelieve21213-packages/logger";
import { Test } from "@nestjs/testing";
import IpfsError from "src/errors/ipfs.error";
import HeliaClientService from "src/main/services/helia-client.service";
import IpfsCoreInternalService from "src/main/services/ipfs-core-internal.service";
import IpfsPinService from "src/main/services/ipfs-pin.service";
import { IpfsErrorType } from "src/types/ipfs-error.types";

describe("IpfsPinService", () => {
	let service: IpfsPinService;
	let heliaClient: jest.Mocked<HeliaClientService>;
	let core: jest.Mocked<IpfsCoreInternalService>;
	let logger: jest.Mocked<LoggerService>;
	let fetchMock: jest.SpyInstance;

	const validCid = "QmTest123";
	const mockKuboUrl = "http://localhost:5001/api/v0";

	beforeEach(async () => {
		jest.clearAllMocks();
		fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true } as Response);

		heliaClient = {
			ensureInitialized: jest.fn(),
			kuboApiUrl: mockKuboUrl,
		} as unknown as jest.Mocked<HeliaClientService>;

		core = {
			ensureInitialized: jest.fn(),
			validateCid: jest.fn(),
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
				IpfsPinService,
				{ provide: HeliaClientService, useValue: heliaClient },
				{ provide: IpfsCoreInternalService, useValue: core },
				{ provide: LoggerService, useValue: logger },
			],
		}).compile();

		service = module.get(IpfsPinService);
	});

	afterEach(() => {
		fetchMock?.mockRestore();
	});

	it("должен установить контекст логгера при создании", () => {
		expect(logger.setContext).toHaveBeenCalledWith("IpfsPinService");
	});

	it("должен создаваться через конструктор с инжектированными зависимостями", () => {
		const pinService = new IpfsPinService(heliaClient, core, logger);
		expect(pinService).toBeInstanceOf(IpfsPinService);
		expect(logger.setContext).toHaveBeenCalledWith("IpfsPinService");
	});

	describe("pin", () => {
		it("должен выбросить ошибку при неинициализированном core", async () => {
			core.ensureInitialized.mockImplementation(() => {
				throw new IpfsError("Not initialized", IpfsErrorType.INITIALIZATION);
			});

			await expect(service.pin(validCid)).rejects.toThrow(IpfsError);
		});

		it("должен успешно закрепить CID", async () => {
			await service.pin(validCid);

			expect(core.ensureInitialized).toHaveBeenCalled();
			expect(heliaClient.ensureInitialized).toHaveBeenCalled();
			expect(core.validateCid).toHaveBeenCalledWith(validCid);
			expect(core.withRetry).toHaveBeenCalled();
			expect(fetchMock).toHaveBeenCalledWith(
				`${mockKuboUrl}/pin/add?arg=${validCid}`,
				expect.objectContaining({ method: "POST" })
			);
			expect(core.logMetrics).toHaveBeenCalledWith("pin", expect.any(Number), undefined, true);
			expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("File pinned - cid:"));
		});

		it("должен выбросить IpfsError при провале pin API", async () => {
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => "Internal Server Error",
			} as Response);

			const err = await service.pin(validCid).catch((e) => e);
			expect(err).toBeInstanceOf(IpfsError);
			expect(err.errorType).toBe(IpfsErrorType.OPERATION);
			expect(core.logMetrics).toHaveBeenCalledWith("pin", expect.any(Number), undefined, false);
		});
	});

	describe("unpin", () => {
		it("должен выбросить ошибку при неинициализированном core", async () => {
			core.ensureInitialized.mockImplementation(() => {
				throw new IpfsError("Not initialized", IpfsErrorType.INITIALIZATION);
			});

			await expect(service.unpin(validCid)).rejects.toThrow(IpfsError);
		});

		it("должен успешно открепить CID", async () => {
			await service.unpin(validCid);

			expect(core.validateCid).toHaveBeenCalledWith(validCid);
			expect(fetchMock).toHaveBeenCalledWith(
				`${mockKuboUrl}/pin/rm?arg=${validCid}`,
				expect.objectContaining({ method: "POST" })
			);
			expect(core.logMetrics).toHaveBeenCalledWith("unpin", expect.any(Number), undefined, true);
			expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("File unpinned - cid:"));
		});

		it("должен успешно обработать ответ not pinned (игнорировать)", async () => {
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => "pin/rm: QmTest123 is not pinned",
			} as Response);

			await expect(service.unpin(validCid)).resolves.not.toThrow();
			expect(core.logMetrics).toHaveBeenCalledWith("unpin", expect.any(Number), undefined, true);
		});

		it("должен выбросить IpfsError при провале unpin API (без not pinned)", async () => {
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => "Some other error",
			} as Response);

			const err = await service.unpin(validCid).catch((e) => e);
			expect(err).toBeInstanceOf(IpfsError);
			expect(err.errorType).toBe(IpfsErrorType.OPERATION);
			expect(core.logMetrics).toHaveBeenCalledWith("unpin", expect.any(Number), undefined, false);
		});

		it("должен обработать ошибку при text() в unpin", async () => {
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => {
					throw new Error("text failed");
				},
			} as unknown as Response);

			const err = await service.unpin(validCid).catch((e) => e);
			expect(err).toBeInstanceOf(IpfsError);
		});
	});
});
