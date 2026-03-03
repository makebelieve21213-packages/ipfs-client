import { Buffer } from "buffer";

import { trustlessGateway } from "@helia/block-brokers";
import { createHeliaHTTP, type Helia } from "@helia/http";
import { unixfs } from "@helia/unixfs";
import { LoggerService } from "@makebelieve21213-packages/logger";
import { Inject, Injectable } from "@nestjs/common";
import CoreService from "src/core/core.service";
import IpfsError from "src/errors/ipfs.error";
import { IpfsErrorType } from "src/types/ipfs-error.types";
import { IPFS_CONFIG_TOKEN } from "src/utils/injections";

import type IpfsConfig from "src/types/ipfs-config";
import type IpfsCoreServiceDto from "src/types/ipfs-core.interface";
import type { FileMetadata } from "src/types/ipfs-core.interface";

// Сервис по управлению клиентов ipfs-core для подключения к сети ipfs
@Injectable()
export default class IpfsCoreService extends CoreService implements IpfsCoreServiceDto {
	private kuboApiUrl!: string;
	private helia!: Helia;
	private fs!: ReturnType<typeof unixfs>;

	constructor(
		@Inject(IPFS_CONFIG_TOKEN)
		protected readonly config: IpfsConfig,
		protected readonly logger: LoggerService
	) {
		super(config, logger);
	}

	// Подключаемся к IPFS через HTTP API
	async onModuleInit(): Promise<void> {
		await super.onModuleInit();

		try {
			// Извлекаем kuboApiUrl из config
			const urls = Array.isArray(this.config.url) ? this.config.url : [this.config.url];
			this.kuboApiUrl = urls[0].replace(/\/+$/, "");

			// Проверяем доступность Kubo
			const idRes = await fetch(`${this.kuboApiUrl}/id`, {
				method: "POST",
				signal: AbortSignal.timeout(5000),
			});
			if (!idRes.ok) {
				throw new Error(`Kubo API returned ${idRes.status}`);
			}
			const idData = (await idRes.json()) as { ID?: string };
			this.logger.log(
				`IPFS Kubo API initialized - peerId: ${idData.ID ?? "unknown"}, url: ${this.kuboApiUrl}`
			);

			// Инициализируем Helia для read-операций (gateways)
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

	// Отключаемся от IPFS клиента при уничтожении модуля
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
		} finally {
			await super.onModuleDestroy();
		}
	}

	// Проверка состояния подключения
	protected ensureInitialized(): void {
		super.ensureInitialized();

		if (!this.helia) {
			throw new IpfsError("IPFS Helia client is not initialized", IpfsErrorType.INITIALIZATION, {
				type: IpfsErrorType.INITIALIZATION,
			});
		}
	}

	// Добавляет данные в IPFS через HTTP‑API и возвращает CID.
	async addFile(data: Uint8Array | string): Promise<string> {
		this.ensureInitialized();

		const startTime = Date.now();
		const input = typeof data === "string" ? new TextEncoder().encode(data) : data;

		// Валидация пустых данных
		if (!input.length) {
			throw new IpfsError("Data cannot be empty", IpfsErrorType.VALIDATION, {
				type: IpfsErrorType.VALIDATION,
				field: "data",
			});
		}

		// Валидация размера
		this.validateDataSize(input);

		try {
			const cidStr = await this.withRetry(
				async () => {
					const formData = new FormData();
					formData.append("file", new Blob([input]));
					const res = await fetch(`${this.kuboApiUrl}/add?pin=true&cid-version=1`, {
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

			this.logMetrics("addFile", duration, input.length, true);

			this.logger.log(
				`File added to IPFS - cid: ${cidStr}, size: ${input.length}, duration: ${duration}`
			);

			return cidStr;
		} catch (error: Error | unknown) {
			const duration = Date.now() - startTime;
			this.logMetrics("addFile", duration, input.length, false);
			throw IpfsError.fromError(error, "Failed to add file to IPFS", IpfsErrorType.OPERATION);
		}
	}

	// Сериализует объект в JSON и добавляет его в IPFS, возвращая строковый CID.
	async addJson(obj: object): Promise<string> {
		this.ensureInitialized();

		// Валидация пустого объекта
		if (!obj || typeof obj !== "object" || !Object.keys(obj).length) {
			throw new IpfsError("Object cannot be empty", IpfsErrorType.VALIDATION, {
				type: IpfsErrorType.VALIDATION,
				field: "obj",
			});
		}

		const json = JSON.stringify(obj);
		const buffer = Buffer.from(json);

		// Валидация размера
		this.validateDataSize(buffer);

		return this.addFile(buffer);
	}

	// Получает файл из IPFS по CID и возвращает Buffer.
	async getFile(cidStr: string): Promise<Buffer> {
		this.ensureInitialized();

		const startTime = Date.now();
		const cid = this.validateCid(cidStr);

		// Проверка кэша
		const cacheKey = `file:${cidStr}`;
		const cached = await this.getFromCache<Buffer>(cacheKey);
		if (cached) {
			this.logger.log(`File retrieved from cache - cid: ${cidStr}`);
			return cached;
		}

		try {
			const chunks: Uint8Array[] = [];

			await this.withRetry(
				async () => {
					for await (const chunk of this.fs.cat(cid)) {
						chunks.push(chunk);
					}
				},
				"getFile",
				{ cid: cidStr }
			);

			const buffer = Buffer.concat(chunks);
			const duration = Date.now() - startTime;

			// Сохранение в кэш
			await this.setCache(cacheKey, buffer);

			this.logMetrics("getFile", duration, buffer.length, true);

			this.logger.log(
				`File retrieved from IPFS - cid: ${cidStr}, size: ${buffer.length}, duration: ${duration}`
			);

			return buffer;
		} catch (error: Error | unknown) {
			const duration = Date.now() - startTime;
			this.logMetrics("getFile", duration, undefined, false);

			// Проверка на ошибку "не найдено"
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

	// Получает файл из IPFS по CID и возвращает поток данных.
	async *getFileStream(cidStr: string): AsyncIterable<Uint8Array> {
		this.ensureInitialized();

		const cid = this.validateCid(cidStr);

		try {
			for await (const chunk of this.fs.cat(cid)) {
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

	// Получает JSON объект из IPFS по CID с автоматическим парсингом.
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

	// Проверяет существование файла в IPFS.
	async exists(cidStr: string): Promise<boolean> {
		this.ensureInitialized();

		const cid = this.validateCid(cidStr);

		try {
			// Легковесная проверка через stat
			await this.fs.stat(cid);
			return true;
		} catch {
			return false;
		}
	}

	// Закрепляет файл в IPFS (pinning).
	async pin(cidStr: string): Promise<void> {
		this.ensureInitialized();

		const startTime = Date.now();
		this.validateCid(cidStr);

		try {
			await this.withRetry(
				async () => {
					const res = await fetch(`${this.kuboApiUrl}/pin/add?arg=${cidStr}`, {
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
			this.logMetrics("pin", duration, undefined, true);

			this.logger.log(`File pinned - cid: ${cidStr}, duration: ${duration}`);
		} catch (error: Error | unknown) {
			const duration = Date.now() - startTime;
			this.logMetrics("pin", duration, undefined, false);
			throw IpfsError.fromError(error, `Failed to pin file: ${cidStr}`, IpfsErrorType.OPERATION);
		}
	}

	// Открепляет файл в IPFS (unpinning).
	async unpin(cidStr: string): Promise<void> {
		this.ensureInitialized();

		const startTime = Date.now();
		this.validateCid(cidStr);

		try {
			await this.withRetry(
				async () => {
					const res = await fetch(`${this.kuboApiUrl}/pin/rm?arg=${cidStr}`, {
						method: "POST",
					});
					if (!res.ok) {
						const text = await res.text().catch(() => "");
						// "not pinned" — не ошибка, просто уже не запинен
						if (text.includes("not pinned")) return;
						throw new Error(`Kubo /pin/rm failed: status=${res.status} ${text}`);
					}
				},
				"unpin",
				{ cid: cidStr }
			);

			const duration = Date.now() - startTime;
			this.logMetrics("unpin", duration, undefined, true);

			this.logger.log(`File unpinned - cid: ${cidStr}, duration: ${duration}`);
		} catch (error: Error | unknown) {
			const duration = Date.now() - startTime;
			this.logMetrics("unpin", duration, undefined, false);
			throw IpfsError.fromError(error, `Failed to unpin file: ${cidStr}`, IpfsErrorType.OPERATION);
		}
	}

	// Проверяет доступность IPFS.
	async healthCheck(): Promise<boolean> {
		if (!this.isInitialized || !this.kuboApiUrl) {
			return false;
		}
		try {
			const res = await fetch(`${this.kuboApiUrl}/id`, {
				method: "POST",
				signal: AbortSignal.timeout(5000),
			});
			return res.ok;
		} catch {
			return false;
		}
	}

	// Получает метаданные файла без загрузки всего содержимого.
	async getFileMetadata(cidStr: string): Promise<FileMetadata> {
		this.ensureInitialized();

		const startTime = Date.now();
		const cid = this.validateCid(cidStr);

		try {
			const stat = await this.withRetry(
				async () => {
					return await this.fs.stat(cid);
				},
				"getFileMetadata",
				{ cid: cidStr }
			);

			// Получаем размер из stat (UnixFSStats может иметь fileSize или другие свойства)
			const statObj = stat as unknown as { fileSize?: bigint | number; size?: bigint | number };
			const size = statObj.fileSize || statObj.size || 0;
			const sizeNumber = typeof size === "bigint" ? Number(size) : Number(size);

			const metadata: FileMetadata = {
				size: sizeNumber,
				cid: cidStr,
			};

			const duration = Date.now() - startTime;
			this.logMetrics("getFileMetadata", duration, undefined, true);

			this.logger.log(
				`File metadata retrieved - cid: ${cidStr}, metadata: ${JSON.stringify(metadata)}, duration: ${duration}`
			);

			return metadata;
		} catch (error: Error | unknown) {
			const duration = Date.now() - startTime;
			this.logMetrics("getFileMetadata", duration, undefined, false);

			// Проверяем оригинальную ошибку, если она обернута в IpfsError
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
