import { LoggerService } from "@makebelieve21213-packages/logger";
import { Test } from "@nestjs/testing";
import CoreService from "src/core/core.service";
import IpfsCoreInternalService from "src/main/services/ipfs-core-internal.service";
import { IPFS_CONFIG_TOKEN } from "src/utils/injections";

import type IpfsConfig from "src/types/ipfs-config";

describe("IpfsCoreInternalService", () => {
	let service: IpfsCoreInternalService;
	let mockConfig: IpfsConfig;
	let logger: jest.Mocked<LoggerService>;

	beforeEach(async () => {
		mockConfig = { url: "http://localhost:5001" };
		logger = {
			setContext: jest.fn(),
			log: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
		} as never;

		const module = await Test.createTestingModule({
			providers: [
				IpfsCoreInternalService,
				{ provide: IPFS_CONFIG_TOKEN, useValue: mockConfig },
				{ provide: LoggerService, useValue: logger },
			],
		}).compile();

		service = module.get(IpfsCoreInternalService);
	});

	it("должен быть экземпляром CoreService", () => {
		expect(service).toBeInstanceOf(CoreService);
		expect(service).toBeInstanceOf(IpfsCoreInternalService);
	});

	it("должен устанавливать контекст логгера при создании", () => {
		expect(logger.setContext).toHaveBeenCalledWith("IpfsCoreInternalService");
	});

	it("должен наследовать методы CoreService", async () => {
		await service.onModuleInit();

		expect(service.isInitialized).toBe(true);
		expect(() => service.ensureInitialized()).not.toThrow();

		await service.onModuleDestroy();
		expect(service.isInitialized).toBe(false);
	});

	it("должен использовать переданную конфигурацию", async () => {
		await service.onModuleInit();

		expect(service.isInitialized).toBe(true);
		expect(logger.log).toHaveBeenCalledWith(
			expect.stringMatching(/IPFS service initialized successfully/)
		);
	});
});
