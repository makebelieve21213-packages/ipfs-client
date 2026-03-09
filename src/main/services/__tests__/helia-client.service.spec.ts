import { LoggerModule } from "@makebelieve21213-packages/logger";
import { Test } from "@nestjs/testing";
import {
	createHeliaHTTP,
	mockHelia,
	mockStop,
	trustlessGateway,
	unixfs,
} from "src/__tests__/__mocks__/helia";
import IpfsError from "src/errors/ipfs.error";
import IpfsCoreModule from "src/main/ipfs-core.module";
import HeliaClientService from "src/main/services/helia-client.service";

import type IpfsConfig from "src/types/ipfs-config";

describe("HeliaClientService", () => {
	let service: HeliaClientService;
	let fetchMock: jest.SpyInstance;
	const mockConfig: IpfsConfig = { url: "http://localhost:5001/api/v0" };

	beforeEach(async () => {
		jest.clearAllMocks();
		fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
			ok: true,
			json: async () => ({ ID: "test-peer" }),
		} as Response);
		createHeliaHTTP.mockResolvedValue(mockHelia);
		trustlessGateway.mockReturnValue({});
		unixfs.mockReturnValue({ cat: jest.fn(), stat: jest.fn() });

		const module = await Test.createTestingModule({
			imports: [
				LoggerModule,
				IpfsCoreModule.forRootAsync({
					useFactory: () => mockConfig,
					inject: [],
				}),
			],
		}).compile();
		await module.init();

		service = module.get<HeliaClientService>(HeliaClientService);
	});

	afterEach(() => {
		fetchMock?.mockRestore();
	});

	it("должен выбросить IpfsError при ensureInitialized до инициализации", () => {
		const uninitService = new HeliaClientService(mockConfig, {
			setContext: jest.fn(),
			log: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
		} as never);

		expect(() => uninitService.ensureInitialized()).toThrow(IpfsError);
	});

	it("должен корректно инициализироваться", () => {
		expect(service.kuboApiUrl).toBe(mockConfig.url);
		expect(service.heliaInstance).toBe(mockHelia);
		expect(service.fsInstance).toBeDefined();
	});

	it("должен корректно останавливаться", async () => {
		const mod = await Test.createTestingModule({
			imports: [
				LoggerModule,
				IpfsCoreModule.forRootAsync({
					useFactory: () => mockConfig,
					inject: [],
				}),
			],
		}).compile();
		await mod.init();

		await mod.close();

		expect(mockStop).toHaveBeenCalled();
	});

	it("должен логировать ошибку при ошибке остановки", async () => {
		mockStop.mockRejectedValueOnce(new Error("Stop failed"));

		const mod = await Test.createTestingModule({
			imports: [
				LoggerModule,
				IpfsCoreModule.forRootAsync({
					useFactory: () => mockConfig,
					inject: [],
				}),
			],
		}).compile();
		await mod.init();

		const logger = mod.get(
			await import("@makebelieve21213-packages/logger").then((m) => m.LoggerService)
		);

		await mod.close();

		expect((logger as unknown as { error: jest.Mock }).error).toHaveBeenCalledWith(
			expect.stringContaining("Failed to stop IPFS Helia client")
		);
	});

	it("должен обработать non-Error при ошибке остановки", async () => {
		mockStop.mockRejectedValueOnce("string error");

		const mod = await Test.createTestingModule({
			imports: [
				LoggerModule,
				IpfsCoreModule.forRootAsync({
					useFactory: () => mockConfig,
					inject: [],
				}),
			],
		}).compile();
		await mod.init();

		const logger = mod.get(
			await import("@makebelieve21213-packages/logger").then((m) => m.LoggerService)
		);

		await mod.close();

		expect((logger as unknown as { error: jest.Mock }).error).toHaveBeenCalledWith(
			expect.stringContaining("string error")
		);
	});

	it("должен выбросить IpfsError при ошибке инициализации с non-Error", async () => {
		fetchMock.mockRejectedValueOnce("network failure");

		const mod = await Test.createTestingModule({
			imports: [
				LoggerModule,
				IpfsCoreModule.forRootAsync({
					useFactory: () => mockConfig,
					inject: [],
				}),
			],
		}).compile();

		await expect(mod.init()).rejects.toThrow(IpfsError);
	});
});
