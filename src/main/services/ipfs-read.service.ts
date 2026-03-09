import { Buffer } from "buffer";

import { LoggerService } from "@makebelieve21213-packages/logger";
import { Inject, Injectable } from "@nestjs/common";
import IpfsError from "src/errors/ipfs.error";
import HeliaClientService from "src/main/services/helia-client.service";
import IpfsCoreInternalService from "src/main/services/ipfs-core-internal.service";
import { IpfsErrorType } from "src/types/ipfs-error.types";

import type { FileMetadata } from "src/types/ipfs-core.interface";

// Сервис управления чтением изображений
@Injectable()
export default class IpfsReadService {
	constructor(
		@Inject(HeliaClientService)
		private readonly heliaClient: HeliaClientService,
		@Inject(IpfsCoreInternalService)
		private readonly core: IpfsCoreInternalService,
		@Inject(LoggerService)
		private readonly logger: LoggerService
	) {
		this.logger.setContext("IpfsReadService");
	}

	async getFile(cidStr: string): Promise<Buffer> {
		this.core.ensureInitialized();
		this.heliaClient.ensureInitialized();

		const startTime = Date.now();
		const cid = this.core.validateCid(cidStr);

		const cacheKey = `file:${cidStr}`;
		const cached = await this.core.getFromCache<Buffer>(cacheKey);
		if (cached) {
			this.logger.log(`File retrieved from cache - cid: ${cidStr}`);
			return cached;
		}

		try {
			const chunks: Uint8Array[] = [];

			await this.core.withRetry(
				async () => {
					for await (const chunk of this.heliaClient.fsInstance.cat(cid)) {
						chunks.push(chunk);
					}
				},
				"getFile",
				{ cid: cidStr }
			);

			const buffer = Buffer.concat(chunks);
			const duration = Date.now() - startTime;

			await this.core.setCache(cacheKey, buffer);

			this.core.logMetrics("getFile", duration, buffer.length, true);

			this.logger.log(
				`File retrieved from IPFS - cid: ${cidStr}, size: ${buffer.length}, duration: ${duration}`
			);

			return buffer;
		} catch (error: Error | unknown) {
			const duration = Date.now() - startTime;
			this.core.logMetrics("getFile", duration, undefined, false);

			if (error instanceof Error && error.message.includes("not found")) {
				throw new IpfsError(
					`File not found: ${cidStr}`,
					IpfsErrorType.NOT_FOUND,
					{ type: IpfsErrorType.NOT_FOUND, cid: cidStr },
					error
				);
			}

			throw IpfsError.fromError(error, `Failed to get file: ${cidStr}`, IpfsErrorType.OPERATION);
		}
	}

	async *getFileStream(cidStr: string): AsyncIterable<Uint8Array> {
		this.core.ensureInitialized();
		this.heliaClient.ensureInitialized();

		const cid = this.core.validateCid(cidStr);

		try {
			for await (const chunk of this.heliaClient.fsInstance.cat(cid)) {
				yield chunk;
			}
		} catch (error: Error | unknown) {
			if (error instanceof Error && error.message.includes("not found")) {
				throw new IpfsError(
					`File not found: ${cidStr}`,
					IpfsErrorType.NOT_FOUND,
					{ type: IpfsErrorType.NOT_FOUND, cid: cidStr },
					error
				);
			}
			throw IpfsError.fromError(error, `Failed to stream file: ${cidStr}`, IpfsErrorType.OPERATION);
		}
	}

	async getJson<T = unknown>(cidStr: string): Promise<T> {
		const buffer = await this.getFile(cidStr);

		try {
			const json = JSON.parse(buffer.toString("utf-8"));
			return json as T;
		} catch (error: Error | unknown) {
			throw new IpfsError(
				`Failed to parse JSON from CID: ${cidStr}`,
				IpfsErrorType.VALIDATION,
				{ type: IpfsErrorType.VALIDATION, field: "cid", value: cidStr },
				error
			);
		}
	}

	async exists(cidStr: string): Promise<boolean> {
		this.core.ensureInitialized();
		this.heliaClient.ensureInitialized();

		const cid = this.core.validateCid(cidStr);

		try {
			await this.heliaClient.fsInstance.stat(cid);
			return true;
		} catch {
			return false;
		}
	}

	async getFileMetadata(cidStr: string): Promise<FileMetadata> {
		this.core.ensureInitialized();
		this.heliaClient.ensureInitialized();

		const startTime = Date.now();
		const cid = this.core.validateCid(cidStr);

		try {
			const stat = await this.core.withRetry(
				async () => {
					return await this.heliaClient.fsInstance.stat(cid);
				},
				"getFileMetadata",
				{ cid: cidStr }
			);

			const statObj = stat as unknown as { fileSize?: bigint | number; size?: bigint | number };
			const size = statObj.fileSize || statObj.size || 0;
			const sizeNumber = typeof size === "bigint" ? Number(size) : Number(size);

			const metadata: FileMetadata = {
				size: sizeNumber,
				cid: cidStr,
			};

			const duration = Date.now() - startTime;
			this.core.logMetrics("getFileMetadata", duration, undefined, true);

			this.logger.log(
				`File metadata retrieved - cid: ${cidStr}, metadata: ${JSON.stringify(metadata)}, duration: ${duration}`
			);

			return metadata;
		} catch (error: Error | unknown) {
			const duration = Date.now() - startTime;
			this.core.logMetrics("getFileMetadata", duration, undefined, false);

			const originalError = error instanceof IpfsError ? error.originalError : error;
			const errorMessage = error instanceof Error ? error.message : String(error);
			const originalErrorMessage =
				originalError instanceof Error ? originalError.message : String(originalError);

			if (errorMessage.includes("not found") || originalErrorMessage.includes("not found")) {
				throw new IpfsError(
					`File not found: ${cidStr}`,
					IpfsErrorType.NOT_FOUND,
					{ type: IpfsErrorType.NOT_FOUND, cid: cidStr },
					originalError || error
				);
			}

			throw IpfsError.fromError(
				error,
				`Failed to get file metadata: ${cidStr}`,
				IpfsErrorType.OPERATION
			);
		}
	}
}
