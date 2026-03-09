import { LoggerService } from "@makebelieve21213-packages/logger";
import { Inject, Injectable } from "@nestjs/common";
import IpfsError from "src/errors/ipfs.error";
import HeliaClientService from "src/main/services/helia-client.service";
import IpfsCoreInternalService from "src/main/services/ipfs-core-internal.service";
import { IpfsErrorType } from "src/types/ipfs-error.types";

// Сервис управления закреплением изображений
@Injectable()
export default class IpfsPinService {
	constructor(
		@Inject(HeliaClientService)
		private readonly heliaClient: HeliaClientService,
		@Inject(IpfsCoreInternalService)
		private readonly core: IpfsCoreInternalService,
		@Inject(LoggerService)
		private readonly logger: LoggerService
	) {
		this.logger.setContext("IpfsPinService");
	}

	async pin(cidStr: string): Promise<void> {
		this.core.ensureInitialized();
		this.heliaClient.ensureInitialized();

		const startTime = Date.now();
		this.core.validateCid(cidStr);

		try {
			await this.core.withRetry(
				async () => {
					const res = await fetch(`${this.heliaClient.kuboApiUrl}/pin/add?arg=${cidStr}`, {
						method: "POST",
					});
					if (!res.ok) {
						const text = await res.text().catch(() => "");
						throw new Error(`Kubo /pin/add failed: status=${res.status} ${text}`);
					}
				},
				"pin",
				{ cid: cidStr }
			);

			const duration = Date.now() - startTime;
			this.core.logMetrics("pin", duration, undefined, true);

			this.logger.log(`File pinned - cid: ${cidStr}, duration: ${duration}`);
		} catch (error: Error | unknown) {
			const duration = Date.now() - startTime;
			this.core.logMetrics("pin", duration, undefined, false);
			throw IpfsError.fromError(error, `Failed to pin file: ${cidStr}`, IpfsErrorType.OPERATION);
		}
	}

	async unpin(cidStr: string): Promise<void> {
		this.core.ensureInitialized();
		this.heliaClient.ensureInitialized();

		const startTime = Date.now();
		this.core.validateCid(cidStr);

		try {
			await this.core.withRetry(
				async () => {
					const res = await fetch(`${this.heliaClient.kuboApiUrl}/pin/rm?arg=${cidStr}`, {
						method: "POST",
					});
					if (!res.ok) {
						const text = await res.text().catch(() => "");
						if (text.includes("not pinned")) return;
						throw new Error(`Kubo /pin/rm failed: status=${res.status} ${text}`);
					}
				},
				"unpin",
				{ cid: cidStr }
			);

			const duration = Date.now() - startTime;
			this.core.logMetrics("unpin", duration, undefined, true);

			this.logger.log(`File unpinned - cid: ${cidStr}, duration: ${duration}`);
		} catch (error: Error | unknown) {
			const duration = Date.now() - startTime;
			this.core.logMetrics("unpin", duration, undefined, false);
			throw IpfsError.fromError(error, `Failed to unpin file: ${cidStr}`, IpfsErrorType.OPERATION);
		}
	}
}
