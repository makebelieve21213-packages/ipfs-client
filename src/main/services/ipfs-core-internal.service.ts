import { LoggerService } from "@makebelieve21213-packages/logger";
import { Inject, Injectable } from "@nestjs/common";
import CoreService from "src/core/core.service";
import { IPFS_CONFIG_TOKEN } from "src/utils/injections";

import type IpfsConfig from "src/types/ipfs-config";

// Сервис управления оберткой над CoreService
@Injectable()
export default class IpfsCoreInternalService extends CoreService {
	constructor(
		@Inject(IPFS_CONFIG_TOKEN)
		config: IpfsConfig,
		@Inject(LoggerService)
		logger: LoggerService
	) {
		super(config, logger);
	}
}
