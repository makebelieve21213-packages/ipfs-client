import { LoggerModule } from "@makebelieve21213-packages/logger";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import {
	createHeliaHTTP,
	trustlessGateway,
	unixfs,
	mockHelia,
	mockFs,
} from "src/__tests__/__mocks__/helia";
import IpfsCoreModule from "src/main/ipfs-core.module";
import IpfsCoreService from "src/main/ipfs-core.service";
import { IPFS_CONFIG_TOKEN } from "src/utils/injections";

import type { TestingModule } from "@nestjs/testing";
import type IpfsConfig from "src/types/ipfs-config";

describe("IpfsCoreModule", () => {
	let module: TestingModule;
	let ipfsCoreService: IpfsCoreService;
	let configService: ConfigService;

	const mockIpfsConfig: IpfsConfig = {
		url: "http://test-ipfs:5001",
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		createHeliaHTTP.mockResolvedValue(mockHelia);
		trustlessGateway.mockReturnValue({});
		unixfs.mockReturnValue(mockFs);

		module = await Test.createTestingModule({
			imports: [
				ConfigModule.forRoot({
					isGlobal: true,
				}),
				LoggerModule,
				IpfsCoreModule.forRootAsync({
					imports: [ConfigModule],
					useFactory: () => mockIpfsConfig,
					inject: [],
				}),
			],
		}).compile();

		ipfsCoreService = module.get<IpfsCoreService>(IpfsCoreService);
		configService = module.get<ConfigService>(ConfigService);
	});

	afterEach(async () => {
		if (module) {
			await module.close();
		}
	});

	describe("Module Creation", () => {
		it("должен создать модуль без ошибок", () => {
			expect(module).toBeDefined();
		});

		it("должен быть помечен декоратором @Global", () => {
			const moduleString = IpfsCoreModule.toString();
			const hasGlobalDecorator =
				moduleString.includes("Global") ||
				Reflect.getMetadataKeys(IpfsCoreModule).some((key) =>
					key.toString().toLowerCase().includes("global")
				);

			expect(hasGlobalDecorator).toBe(true);
		});
	});

	describe("Providers Registration", () => {
		it("должен зарегистрировать IpfsCoreService как провайдер", () => {
			expect(ipfsCoreService).toBeDefined();
			expect(ipfsCoreService).toBeInstanceOf(IpfsCoreService);
		});

		it("должен зарегистрировать ConfigService через ConfigModule", () => {
			expect(configService).toBeDefined();
			expect(configService).toBeInstanceOf(ConfigService);
		});

		it("должен создать только один экземпляр IpfsCoreService (singleton)", () => {
			const secondInstance = module.get<IpfsCoreService>(IpfsCoreService);
			expect(ipfsCoreService).toBe(secondInstance);
		});

		it("должен зарегистрировать IPFS_CONFIG_TOKEN с правильной конфигурацией", () => {
			const config = module.get<IpfsConfig>(IPFS_CONFIG_TOKEN);
			expect(config).toBeDefined();
			expect(config.url).toBe(mockIpfsConfig.url);
		});
	});

	describe("Service Export", () => {
		it("должен экспортировать IpfsCoreService и делать его доступным для внедрения зависимостей", async () => {
			jest.clearAllMocks();
			createHeliaHTTP.mockResolvedValue(mockHelia);
			trustlessGateway.mockReturnValue({});
			unixfs.mockReturnValue(mockFs);

			const testModule = await Test.createTestingModule({
				imports: [
					ConfigModule.forRoot({
						isGlobal: true,
					}),
					LoggerModule,
					IpfsCoreModule.forRootAsync({
						imports: [ConfigModule],
						useFactory: () => mockIpfsConfig,
						inject: [],
					}),
				],
				providers: [
					{
						provide: "TestService",
						useFactory: (ipfsService: IpfsCoreService) => {
							return {
								ipfsService,
								hasIpfsService: () => Boolean(ipfsService),
								canAddFile: () => typeof ipfsService.addFile === "function",
								canGetFile: () => typeof ipfsService.getFile === "function",
							};
						},
						inject: [IpfsCoreService],
					},
				],
			}).compile();

			const testService = testModule.get("TestService");

			expect(testService.ipfsService).toBeInstanceOf(IpfsCoreService);
			expect(testService.hasIpfsService()).toBe(true);
			expect(testService.canAddFile()).toBe(true);
			expect(testService.canGetFile()).toBe(true);

			await testModule.close();
		});
	});

	describe("Configuration Integration", () => {
		it("должен передать конфигурацию в IpfsCoreService", () => {
			expect(ipfsCoreService["config"]).toBeDefined();
			expect(ipfsCoreService["config"].url).toBe(mockIpfsConfig.url);
		});

		it("должен работать с различными URL конфигурациями", async () => {
			jest.clearAllMocks();
			createHeliaHTTP.mockResolvedValue(mockHelia);
			trustlessGateway.mockReturnValue({});
			unixfs.mockReturnValue(mockFs);

			const customUrl = "http://custom-ipfs:8080";
			const customConfig: IpfsConfig = { url: customUrl };

			const customModule = await Test.createTestingModule({
				imports: [
					ConfigModule.forRoot({
						isGlobal: true,
					}),
					LoggerModule,
					IpfsCoreModule.forRootAsync({
						imports: [ConfigModule],
						useFactory: () => customConfig,
						inject: [],
					}),
				],
			}).compile();

			const customService = customModule.get<IpfsCoreService>(IpfsCoreService);
			expect(customService["config"].url).toBe(customUrl);

			await customModule.close();
		});
	});

	describe("Global Module Behavior", () => {
		it("должен экспортировать сервис для использования в других модулях через DI", async () => {
			jest.clearAllMocks();
			createHeliaHTTP.mockResolvedValue(mockHelia);
			trustlessGateway.mockReturnValue({});
			unixfs.mockReturnValue(mockFs);

			const testModule = await Test.createTestingModule({
				imports: [
					ConfigModule.forRoot({
						isGlobal: true,
					}),
					LoggerModule,
					IpfsCoreModule.forRootAsync({
						imports: [ConfigModule],
						useFactory: () => mockIpfsConfig,
						inject: [],
					}),
				],
				providers: [
					{
						provide: "TestServiceConsumer",
						useFactory: (ipfsService: IpfsCoreService) => {
							return {
								ipfsService,
								canUseIpfs: () => Boolean(ipfsService),
								getServiceName: () => ipfsService.constructor.name,
							};
						},
						inject: [IpfsCoreService],
					},
				],
			}).compile();

			const testServiceConsumer = testModule.get("TestServiceConsumer");

			expect(testServiceConsumer).toBeDefined();
			expect(testServiceConsumer.ipfsService).toBeInstanceOf(IpfsCoreService);
			expect(testServiceConsumer.canUseIpfs()).toBe(true);
			expect(testServiceConsumer.getServiceName()).toBe("IpfsCoreService");

			await testModule.close();
		});
	});

	describe("Service Initialization", () => {
		it("должен правильно инициализировать IpfsCoreService с зависимостями", () => {
			expect(ipfsCoreService).toBeDefined();
			expect(ipfsCoreService["config"]).toBeDefined();
			expect(ipfsCoreService["config"].url).toBe(mockIpfsConfig.url);
		});

		it("должен инициализировать сервис с доступными методами интерфейса", () => {
			expect(typeof ipfsCoreService.addFile).toBe("function");
			expect(typeof ipfsCoreService.addJson).toBe("function");
			expect(typeof ipfsCoreService.getFile).toBe("function");
			expect(typeof ipfsCoreService.onModuleInit).toBe("function");
		});
	});

	describe("Module Dependencies", () => {
		it("должен корректно разрешить все зависимости модуля", () => {
			expect(() => module.get<IpfsCoreService>(IpfsCoreService)).not.toThrow();
			expect(() => module.get<ConfigService>(ConfigService)).not.toThrow();
			expect(() => module.get<IpfsConfig>(IPFS_CONFIG_TOKEN)).not.toThrow();
		});
	});

	describe("Module Lifecycle", () => {
		it("должен корректно завершить работу при закрытии модуля", async () => {
			jest.clearAllMocks();
			createHeliaHTTP.mockResolvedValue(mockHelia);
			trustlessGateway.mockReturnValue({});
			unixfs.mockReturnValue(mockFs);

			const lifecycleModule = await Test.createTestingModule({
				imports: [
					ConfigModule.forRoot({
						isGlobal: true,
					}),
					LoggerModule,
					IpfsCoreModule.forRootAsync({
						imports: [ConfigModule],
						useFactory: () => mockIpfsConfig,
						inject: [],
					}),
				],
			}).compile();

			const lifecycleService = lifecycleModule.get<IpfsCoreService>(IpfsCoreService);
			expect(lifecycleService).toBeDefined();

			await expect(lifecycleModule.close()).resolves.not.toThrow();
		});

		it("должен инициализировать сервис при создании модуля", async () => {
			jest.clearAllMocks();
			createHeliaHTTP.mockResolvedValue(mockHelia);
			trustlessGateway.mockReturnValue({});
			unixfs.mockReturnValue(mockFs);

			const initModule = await Test.createTestingModule({
				imports: [
					ConfigModule.forRoot({
						isGlobal: true,
					}),
					LoggerModule,
					IpfsCoreModule.forRootAsync({
						imports: [ConfigModule],
						useFactory: () => mockIpfsConfig,
						inject: [],
					}),
				],
			}).compile();

			await initModule.init();

			const initService = initModule.get<IpfsCoreService>(IpfsCoreService);

			expect(initService["helia"]).toBeDefined();

			await initModule.close();
		});
	});

	describe("forRootAsync", () => {
		it("должен создать динамический модуль с правильной структурой", () => {
			const dynamicModule = IpfsCoreModule.forRootAsync({
				imports: [ConfigModule],
				useFactory: () => mockIpfsConfig,
				inject: [],
			});

			expect(dynamicModule).toBeDefined();
			expect(dynamicModule.module).toBe(IpfsCoreModule);
			expect(dynamicModule.imports).toContain(ConfigModule);
			expect(dynamicModule.imports).toContain(LoggerModule);
			expect(dynamicModule.providers).toBeDefined();
			expect(dynamicModule.exports).toContain(IpfsCoreService);
		});

		it("должен работать без указания imports", () => {
			const dynamicModule = IpfsCoreModule.forRootAsync({
				useFactory: () => mockIpfsConfig,
			});

			expect(dynamicModule).toBeDefined();
			expect(dynamicModule.imports).toContain(ConfigModule);
			expect(dynamicModule.imports).toContain(LoggerModule);
		});

		it("должен работать с асинхронной useFactory", async () => {
			jest.clearAllMocks();
			createHeliaHTTP.mockResolvedValue(mockHelia);
			trustlessGateway.mockReturnValue({});
			unixfs.mockReturnValue(mockFs);

			const asyncConfig = Promise.resolve(mockIpfsConfig);

			const dynamicModule = IpfsCoreModule.forRootAsync({
				useFactory: async () => await asyncConfig,
			});

			expect(dynamicModule).toBeDefined();

			const testModule = await Test.createTestingModule({
				imports: [
					ConfigModule.forRoot({
						isGlobal: true,
					}),
					LoggerModule,
					dynamicModule,
				],
			}).compile();

			const service = testModule.get<IpfsCoreService>(IpfsCoreService);
			expect(service).toBeDefined();

			await testModule.close();
		});

		it("должен использовать LoggerService из LoggerModule", async () => {
			jest.clearAllMocks();
			createHeliaHTTP.mockResolvedValue(mockHelia);
			trustlessGateway.mockReturnValue({});
			unixfs.mockReturnValue(mockFs);

			const testModule = await Test.createTestingModule({
				imports: [
					ConfigModule.forRoot({
						isGlobal: true,
					}),
					LoggerModule,
					IpfsCoreModule.forRootAsync({
						imports: [ConfigModule],
						useFactory: () => mockIpfsConfig,
						inject: [],
					}),
				],
			}).compile();

			const service = testModule.get<IpfsCoreService>(IpfsCoreService);
			expect(service).toBeDefined();
			expect(service["logger"]).toBeDefined();

			await testModule.close();
		});

		it("должен использовать useFactory для создания сервиса", async () => {
			jest.clearAllMocks();
			createHeliaHTTP.mockResolvedValue(mockHelia);
			trustlessGateway.mockReturnValue({});
			unixfs.mockReturnValue(mockFs);

			const useFactorySpy = jest.fn().mockReturnValue(mockIpfsConfig);

			const testModule = await Test.createTestingModule({
				imports: [
					ConfigModule.forRoot({
						isGlobal: true,
					}),
					LoggerModule,
					IpfsCoreModule.forRootAsync({
						imports: [ConfigModule],
						useFactory: useFactorySpy,
						inject: [],
					}),
				],
			}).compile();

			const service = testModule.get<IpfsCoreService>(IpfsCoreService);
			expect(service).toBeDefined();
			expect(useFactorySpy).toHaveBeenCalled();

			await testModule.close();
		});
	});
});
