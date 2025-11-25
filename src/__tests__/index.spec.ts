import { LoggerService } from "@makebelieve21213-packages/logger";
import { ConsoleLogger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
	createHeliaHTTP,
	trustlessGateway,
	unixfs,
	mockHelia,
	mockFs,
} from "src/__tests__/__mocks__/helia";
import { IpfsCoreService, IpfsCoreModule } from "src/index";

import type IpfsConfig from "src/types/ipfs-config";

describe("Index exports", () => {
	describe("IpfsCoreService export", () => {
		it("должен экспортировать IpfsCoreService как класс", () => {
			expect(IpfsCoreService).toBeDefined();
			expect(typeof IpfsCoreService).toBe("function");
			expect(IpfsCoreService.constructor).toBeDefined();
		});

		it("должен иметь правильное имя класса", () => {
			expect(IpfsCoreService.name).toBe("IpfsCoreService");
		});

		it("должен быть конструируемым классом", () => {
			const mockLoggerService = {
				setContext: jest.fn(),
				log: jest.fn(),
				error: jest.fn(),
				warn: jest.fn(),
				debug: jest.fn(),
				info: jest.fn(),
			} as unknown as LoggerService;

			const mockConfig: IpfsConfig = {
				url: "http://localhost:5001",
			};

			expect(() => new IpfsCoreService(mockConfig, mockLoggerService)).not.toThrow();
		});

		it("должен иметь необходимые методы интерфейса", () => {
			const mockLoggerService = {
				setContext: jest.fn(),
				log: jest.fn(),
				error: jest.fn(),
				warn: jest.fn(),
				debug: jest.fn(),
				info: jest.fn(),
			} as unknown as LoggerService;

			const mockConfig: IpfsConfig = {
				url: "http://localhost:5001",
			};

			const instance = new IpfsCoreService(mockConfig, mockLoggerService);

			// Проверяем наличие методов из интерфейса IpfsCoreServiceDto
			expect(typeof instance.addFile).toBe("function");
			expect(typeof instance.getFile).toBe("function");
			expect(typeof instance.addJson).toBe("function");
			expect(typeof instance.onModuleInit).toBe("function");
		});

		it("должен быть экземпляром правильного класса", () => {
			const mockLoggerService = {
				setContext: jest.fn(),
				log: jest.fn(),
				error: jest.fn(),
				warn: jest.fn(),
				debug: jest.fn(),
				info: jest.fn(),
			} as unknown as LoggerService;

			const mockConfig: IpfsConfig = {
				url: "http://localhost:5001",
			};

			const instance = new IpfsCoreService(mockConfig, mockLoggerService);
			expect(instance).toBeInstanceOf(IpfsCoreService);
		});
	});

	describe("IpfsCoreModule export", () => {
		it("должен экспортировать IpfsCoreModule как класс", () => {
			expect(IpfsCoreModule).toBeDefined();
			expect(typeof IpfsCoreModule).toBe("function");
			expect(IpfsCoreModule.constructor).toBeDefined();
		});

		it("должен иметь правильное имя класса", () => {
			expect(IpfsCoreModule.name).toBe("IpfsCoreModule");
		});

		it("должен быть конструируемым классом", () => {
			expect(() => new IpfsCoreModule()).not.toThrow();
		});

		it("должен иметь метаданные NestJS модуля", async () => {
			const moduleRef = await Test.createTestingModule({
				imports: [IpfsCoreModule],
			}).compile();

			expect(moduleRef).toBeDefined();
			expect(moduleRef.get).toBeDefined();
		});

		it("должен быть экземпляром правильного класса", () => {
			const instance = new IpfsCoreModule();
			expect(instance).toBeInstanceOf(IpfsCoreModule);
		});
	});

	describe("Проверка типов экспортов", () => {
		it("должен экспортировать все заявленные сущности", () => {
			// Проверяем, что все экспорты определены
			expect(IpfsCoreService).toBeDefined();
			expect(IpfsCoreModule).toBeDefined();
		});

		it("должен экспортировать только функции-конструкторы", () => {
			expect(typeof IpfsCoreService).toBe("function");
			expect(typeof IpfsCoreModule).toBe("function");
		});

		it("не должен экспортировать undefined или null", () => {
			expect(IpfsCoreService).not.toBeNull();
			expect(IpfsCoreService).not.toBeUndefined();
			expect(IpfsCoreModule).not.toBeNull();
			expect(IpfsCoreModule).not.toBeUndefined();
		});
	});

	describe("Интеграционные тесты экспортов", () => {
		beforeEach(() => {
			jest.clearAllMocks();
			createHeliaHTTP.mockResolvedValue(mockHelia);
			trustlessGateway.mockReturnValue({});
			unixfs.mockReturnValue(mockFs);
		});

		it("должен правильно работать с NestJS TestingModule", async () => {
			const mockConfig: IpfsConfig = {
				url: "http://localhost:5001",
			};

			const moduleRef = await Test.createTestingModule({
				imports: [
					IpfsCoreModule.forRootAsync({
						useFactory: () => mockConfig,
					}),
				],
				providers: [
					{
						provide: LoggerService,
						useValue: new ConsoleLogger("IpfsCoreService"),
					},
				],
			}).compile();

			const service = moduleRef.get<IpfsCoreService>(IpfsCoreService);
			expect(service).toBeDefined();
			expect(service).toBeInstanceOf(IpfsCoreService);

			await moduleRef.close();
		});

		it("должен корректно создавать экземпляры через NestJS DI", async () => {
			const mockConfig: IpfsConfig = {
				url: "http://localhost:5001",
			};

			const moduleRef = await Test.createTestingModule({
				imports: [
					IpfsCoreModule.forRootAsync({
						useFactory: () => mockConfig,
					}),
				],
				providers: [
					{
						provide: LoggerService,
						useValue: new ConsoleLogger("IpfsCoreService"),
					},
				],
			}).compile();

			// Проверяем, что сервис создается через DI
			const service1 = moduleRef.get<IpfsCoreService>(IpfsCoreService);
			const service2 = moduleRef.get<IpfsCoreService>(IpfsCoreService);

			expect(service1).toBe(service2); // Должно быть синглтоном

			await moduleRef.close();
		});
	});

	describe("Проверка корректности экспортов с реальными импортами", () => {
		// Этот тест проверяет, что экспорты работают без моков
		it("должен корректно импортировать реальные модули", async () => {
			// Сбрасываем все моки для чистого теста
			jest.unmock("src/main/ipfs-core.service");
			jest.unmock("src/main/ipfs-core.module");

			// Динамически импортируем без моков
			const realModule = await import("src/index");

			expect(realModule.IpfsCoreService).toBeDefined();
			expect(realModule.IpfsCoreModule).toBeDefined();
			expect(typeof realModule.IpfsCoreService).toBe("function");
			expect(typeof realModule.IpfsCoreModule).toBe("function");
		});
	});
});
