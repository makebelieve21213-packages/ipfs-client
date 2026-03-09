import { Buffer } from "buffer";

import { LoggerService } from "@makebelieve21213-packages/logger";
import { Inject, Injectable } from "@nestjs/common";
import IpfsError from "src/errors/ipfs.error";
import HeliaClientService from "src/main/services/helia-client.service";
import IpfsCoreInternalService from "src/main/services/ipfs-core-internal.service";
import { IpfsErrorType } from "src/types/ipfs-error.types";

// Сервис управления добавлением изображений
@Injectable()
export default class IpfsAddService {
	constructor(
		@Inject(HeliaClientService)
		private readonly heliaClient: HeliaClientService,
		@Inject(IpfsCoreInternalService)
		private readonly core: IpfsCoreInternalService,
		@Inject(LoggerService)
		private readonly logger: LoggerService
	) {
		this.logger.setContext(IpfsAddService.name);
	}

	async addFile(data: Uint8Array | string): Promise<string> {
		this.core.ensureInitialized();
		this.heliaClient.ensureInitialized();

		const startTime = Date.now();
		const input = typeof data === "string" ? new TextEncoder().encode(data) : data;

		if (!input.length) {
			throw new IpfsError("Data cannot be empty", IpfsErrorType.VALIDATION, {
				type: IpfsErrorType.VALIDATION,
				field: "data",
			});
		}

		this.core.validateDataSize(input);

		try {
			const cidStr = await this.core.withRetry(
				async () => {
					const formData = new FormData();
					formData.append("file", new Blob([input]));
					const res = await fetch(`${this.heliaClient.kuboApiUrl}/add?pin=true&cid-version=1`, {
						method: "POST",
						body: formData,
					});
					if (!res.ok) {
						const text = await res.text().catch(() => "");
						throw new Error(`Kubo /add failed: status=${res.status} ${text}`);
					}
					const json = (await res.json()) as { Hash: string };
					return json.Hash;
				},
				"addFile",
				{ size: input.length }
			);
			const duration = Date.now() - startTime;

			this.core.logMetrics("addFile", duration, input.length, true);

			this.logger.log(
				`File added to IPFS - cid: ${cidStr}, size: ${input.length}, duration: ${duration}`
			);

			return cidStr;
		} catch (error: Error | unknown) {
			const duration = Date.now() - startTime;
			this.core.logMetrics("addFile", duration, input.length, false);
			throw IpfsError.fromError(error, "Failed to add file to IPFS", IpfsErrorType.OPERATION);
		}
	}

	async addJson(obj: object): Promise<string> {
		this.core.ensureInitialized();
		this.heliaClient.ensureInitialized();

		if (!obj || typeof obj !== "object" || !Object.keys(obj).length) {
			throw new IpfsError("Object cannot be empty", IpfsErrorType.VALIDATION, {
				type: IpfsErrorType.VALIDATION,
				field: "obj",
			});
		}

		const json = JSON.stringify(obj);
		const buffer = Buffer.from(json);

		this.core.validateDataSize(buffer);

		return this.addFile(buffer);
	}
}
