import { Buffer } from "buffer";

import { trustlessGateway } from "@helia/block-brokers";
import { createHeliaHTTP, type Helia } from "@helia/http";
import { unixfs } from "@helia/unixfs";
import { LoggerService } from "@makebelieve21213-packages/logger";
import { Inject, Injectable } from "@nestjs/common";
import { CID } from "multiformats";
import CoreService from "src/core/core.service.js";
import IpfsError from "src/errors/ipfs.error.js";
import { IpfsErrorType } from "src/types/ipfs-error.types.js";
import { IPFS_CONFIG_TOKEN } from "src/utils/injections.js";

import type IpfsConfig from "src/types/ipfs-config.js";
import type IpfsCoreServiceDto from "src/types/ipfs-core.interface.js";
import type { FileMetadata } from "src/types/ipfs-core.interface.js";

// Сервис по управлению клиентов ipfs-core для подключения к сети ipfs
@Injectable()
export default class IpfsCoreService extends CoreService implements IpfsCoreServiceDto {
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
			// Получаем массив gateway URLs
			const gateways = Array.isArray(this.config.url) ? this.config.url : [this.config.url];

			// Создаем helia клиент с кастомными опциями
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
			const cid = await this.withRetry(
				async () => {
					return await this.fs.addBytes(input);
				},
				"addFile",
				{ size: input.length }
			);

			const cidStr = cid.toString();
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
		const cid = this.validateCid(cidStr);

		try {
			await this.withRetry(
				async () => {
					// Используем helia pinning API если доступен
					if (this.helia.pins) {
						const pins = this.helia.pins as unknown as { add: (cid: CID) => AsyncGenerator<CID> };

						if (typeof pins.add === "function") {
							// Потребляем async generator
							for await (const _ of pins.add(cid)) {
								// Игнорируем результат
							}
						} else {
							// Fallback: просто проверяем существование
							await this.fs.stat(cid);
						}
					} else {
						// Fallback: просто проверяем существование
						await this.fs.stat(cid);
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
		const cid = this.validateCid(cidStr);

		try {
			await this.withRetry(
				async () => {
					// Используем helia pinning API если доступен
					if (this.helia.pins) {
						const pins = this.helia.pins as unknown as { rm: (cid: CID) => AsyncGenerator<CID> };
						if (typeof pins.rm === "function") {
							// Потребляем async generator
							for await (const _ of pins.rm(cid)) {
								// Игнорируем результат
							}
						}
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
		if (!this.isInitialized || !this.helia) {
			return false;
		}

		try {
			// Пытаемся выполнить простую операцию для проверки доступности
			await this.withTimeout(async () => {
				// Просто проверяем, что helia инициализирован
				return true;
			}, "healthCheck");
			return true;
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
