import { trustlessGateway } from "@helia/block-brokers";
import { createHeliaHTTP, type Helia } from "@helia/http";
import { unixfs } from "@helia/unixfs";
import { LoggerService } from "@makebelieve21213-packages/logger";
import { Inject, Injectable } from "@nestjs/common";
import IpfsError from "src/errors/ipfs.error";
import { IpfsErrorType } from "src/types/ipfs-error.types";
import { IPFS_CONFIG_TOKEN } from "src/utils/injections";

import type IpfsConfig from "src/types/ipfs-config";

// Сервис управления Helia клиентом
@Injectable()
export default class HeliaClientService {
	private helia!: Helia;
	private fs!: ReturnType<typeof unixfs>;
	private _kuboApiUrl!: string;

	constructor(
		@Inject(IPFS_CONFIG_TOKEN)
		protected readonly config: IpfsConfig,
		@Inject(LoggerService)
		protected readonly logger: LoggerService
	) {
		this.logger.setContext(HeliaClientService.name);
	}

	get kuboApiUrl(): string {
		return this._kuboApiUrl;
	}

	get heliaInstance(): Helia {
		return this.helia;
	}

	get fsInstance(): ReturnType<typeof unixfs> {
		return this.fs;
	}

	async onModuleInit(): Promise<void> {
		try {
			const urls = Array.isArray(this.config.url) ? this.config.url : [this.config.url];
			this._kuboApiUrl = urls[0].replace(/\/+$/, "");

			const idRes = await fetch(`${this._kuboApiUrl}/id`, {
				method: "POST",
				signal: AbortSignal.timeout(5000),
			});
			if (!idRes.ok) {
				throw new Error(`Kubo API returned ${idRes.status}`);
			}
			const idData = (await idRes.json()) as { ID?: string };
			this.logger.log(
				`IPFS Kubo API initialized - peerId: ${idData.ID ?? "unknown"}, url: ${this._kuboApiUrl}`
			);

			const gateways = urls;
			const heliaOptions = {
				blockBrokers: [
					trustlessGateway({
						gateways,
					}),
				],
				...(this.config.heliaOptions || {}),
			};

			this.helia = await createHeliaHTTP(heliaOptions);
			this.fs = unixfs(this.helia);

			this.logger.log(`IPFS Helia client initialized - gateways: ${gateways.length}`);
		} catch (error: Error | unknown) {
			this.logger.error(
				`Failed to initialize IPFS Helia client - error: ${error instanceof Error ? error.message : String(error)}`
			);
			throw IpfsError.fromError(
				error,
				"Failed to initialize IPFS Helia client",
				IpfsErrorType.INITIALIZATION
			);
		}
	}

	async onModuleDestroy(): Promise<void> {
		try {
			if (this.helia) {
				await this.helia.stop();
				this.logger.log("IPFS Helia client stopped");
			}
		} catch (error: Error | unknown) {
			this.logger.error(
				`Failed to stop IPFS Helia client - error: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	ensureInitialized(): void {
		if (!this.helia) {
			throw new IpfsError("IPFS Helia client is not initialized", IpfsErrorType.INITIALIZATION, {
				type: IpfsErrorType.INITIALIZATION,
			});
		}
	}
}
