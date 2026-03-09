import { LoggerModule } from "@makebelieve21213-packages/logger";
import { DynamicModule, Global, Module, Type } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import IpfsCoreService from "src/main/ipfs-core.service";
import HeliaClientService from "src/main/services/helia-client.service";
import IpfsAddService from "src/main/services/ipfs-add.service";
import IpfsCoreInternalService from "src/main/services/ipfs-core-internal.service";
import IpfsPinService from "src/main/services/ipfs-pin.service";
import IpfsReadService from "src/main/services/ipfs-read.service";
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
			IpfsCoreInternalService,
			HeliaClientService,
			IpfsAddService,
			IpfsReadService,
			IpfsPinService,
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
