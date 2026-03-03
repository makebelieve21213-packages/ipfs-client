import { LoggerModule } from "@makebelieve21213-packages/logger";
import { DynamicModule, Global, Module, Type } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import IpfsCoreService from "src/main/ipfs-core.service";
import { IPFS_CONFIG_TOKEN } from "src/utils/injections";

import type { InjectionToken, Provider } from "@nestjs/common";
import type IpfsConfig from "src/types/ipfs-config";

// Глобальный модуль, предоставляющий клиент ipfs-core для доступа к сети ipfs (облачная сеть)
@Global()
@Module({})
export default class IpfsCoreModule {
	// Статический метод для настройки модуля с конфигурацией через forRootAsync
	static forRootAsync(options: {
		imports?: Type<unknown>[];
		useFactory: (...args: unknown[]) => Promise<IpfsConfig> | IpfsConfig;
		inject?: InjectionToken[];
	}): DynamicModule {
		const providers: Provider[] = [
			{
				provide: IPFS_CONFIG_TOKEN,
				useFactory: async (...args: unknown[]) => {
					return await options.useFactory(...args);
				},
				inject: options.inject || [],
			},
			IpfsCoreService,
		];

		return {
			module: IpfsCoreModule,
			imports: [ConfigModule, LoggerModule, ...(options.imports || [])],
			providers,
			exports: [IpfsCoreService],
		};
	}
}
