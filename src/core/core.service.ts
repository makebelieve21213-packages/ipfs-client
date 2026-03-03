import { PrometheusService } from "@makebelieve21213-packages/prometheus-client";
import { RedisClientService } from "@makebelieve21213-packages/redis-client";
import { CID } from "multiformats";
import IpfsError from "src/errors/ipfs.error";
import { IpfsErrorType } from "src/types/ipfs-error.types";

import type { LoggerService } from "@makebelieve21213-packages/logger";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type IpfsConfig from "src/types/ipfs-config";
import type { CacheEntry } from "src/types/ipfs-core.interface";

// Базовый класс для IPFS сервисов
export default class CoreService implements OnModuleInit, OnModuleDestroy {
	protected isInitialized = false;
	protected cache = new Map<string, CacheEntry>();
	protected redisClient: RedisClientService | null = null;
	protected prometheusClient: PrometheusService | null = null;
	protected ipfsOperationDuration: ReturnType<PrometheusService["createHistogram"]> | null = null;
	protected ipfsOperationCounter: ReturnType<PrometheusService["createCounter"]> | null = null;

	constructor(
		protected readonly config: IpfsConfig,
		protected readonly logger: LoggerService
	) {
		this.logger.setContext(this.constructor.name);
	}

	// Подключаемся к IPFS через HTTP API
	async onModuleInit(): Promise<void> {
		try {
			// Валидация URL конфигурации
			this.validateConfig();

			// Инициализация Redis клиента (если указан в конфиге)
			await this.initializeRedis();

			// Инициализация Prometheus клиента (если указан в конфиге)
			await this.initializePrometheus();

			this.isInitialized = true;

			this.logger.log(
				`IPFS service initialized successfully - redisEnabled: ${!!this.redisClient}, prometheusEnabled: ${!!this.prometheusClient}`
			);
		} catch (error: Error | unknown) {
			this.logger.error(
				`Failed to initialize IPFS service - error: ${error instanceof Error ? error.message : String(error)}`
			);
			throw IpfsError.fromError(
				error,
				"Failed to initialize IPFS service",
				IpfsErrorType.INITIALIZATION
			);
		}
	}

	// Отключаемся от IPFS клиента при уничтожении модуля
	async onModuleDestroy(): Promise<void> {
		try {
			if (this.redisClient) {
				await this.redisClient.onModuleDestroy();
			}
			if (this.isInitialized) {
				this.isInitialized = false;
				this.logger.log("IPFS service destroyed successfully");
			}
		} catch (error: Error | unknown) {
			this.logger.error(
				`Failed to destroy IPFS service - error: ${error instanceof Error ? error.message : String(error)}`
			);
			throw IpfsError.fromError(error, "Failed to destroy IPFS service", IpfsErrorType.OPERATION);
		}
	}

	// Проверка состояния подключения
	protected ensureInitialized(): void {
		if (!this.isInitialized) {
			throw new IpfsError("IPFS service is not initialized", IpfsErrorType.INITIALIZATION, {
				type: IpfsErrorType.INITIALIZATION,
			});
		}
	}

	// Валидация конфигурации
	protected validateConfig(): void {
		if (!this.config.url) {
			throw new IpfsError("IPFS gateway URL is required", IpfsErrorType.VALIDATION, {
				type: IpfsErrorType.VALIDATION,
				field: "url",
			});
		}

		const urls = Array.isArray(this.config.url) ? this.config.url : [this.config.url];
		for (const url of urls) {
			try {
				new URL(url);
			} catch {
				throw new IpfsError(`Invalid gateway URL: ${url}`, IpfsErrorType.VALIDATION, {
					type: IpfsErrorType.VALIDATION,
					field: "url",
					value: url,
				});
			}
		}
	}

	// Валидация CID
	protected validateCid(cidStr: string): CID {
		if (!cidStr || typeof cidStr !== "string" || cidStr.trim().length === 0) {
			throw new IpfsError("CID cannot be empty", IpfsErrorType.VALIDATION, {
				type: IpfsErrorType.VALIDATION,
				field: "cid",
			});
		}

		try {
			const cid = CID.parse(cidStr);
			// Проверка версии CID (v0 или v1)
			if (cid.version !== 0 && cid.version !== 1) {
				throw new IpfsError(
					`Unsupported CID version: ${cid.version}. Only v0 and v1 are supported`,
					IpfsErrorType.VALIDATION,
					{ type: IpfsErrorType.VALIDATION, field: "cid", value: cidStr }
				);
			}
			return cid;
		} catch (error: Error | unknown) {
			if (error instanceof IpfsError) {
				throw IpfsError.fromError(error);
			}
			throw new IpfsError(
				`Invalid CID format: ${cidStr}`,
				IpfsErrorType.VALIDATION,
				{ type: IpfsErrorType.VALIDATION, field: "cid", value: cidStr },
				error
			);
		}
	}

	// Валидация размера данных
	protected validateDataSize(data: Uint8Array): void {
		const maxSize = this.config.maxFileSize;

		if (maxSize && data.length > maxSize) {
			throw new IpfsError(
				`File size ${data.length} exceeds maximum allowed size ${maxSize}`,
				IpfsErrorType.VALIDATION,
				{ type: IpfsErrorType.VALIDATION, field: "data", value: data.length }
			);
		}
	}

	// Retry механизм с экспоненциальной задержкой
	protected async withRetry<T>(
		operation: () => Promise<T>,
		operationName: string,
		context?: Record<string, unknown>
	): Promise<T> {
		const retryConfig = this.config.retry || {};
		const maxAttempts = retryConfig.maxAttempts || 3;
		const baseDelay = retryConfig.delay || 1000;

		let lastError: Error | unknown;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				return await this.withTimeout(operation, operationName);
			} catch (error: Error | unknown) {
				lastError = error;

				if (attempt < maxAttempts) {
					const delay = baseDelay * Math.pow(2, attempt - 1);
					const contextStr = context
						? ` - ${JSON.stringify({
								...context,
								attempt,
								delay,
								error: error instanceof Error ? error.message : String(error),
							})}`
						: ` - attempt: ${attempt}, delay: ${delay}, error: ${error instanceof Error ? error.message : String(error)}`;
					this.logger.warn(`Retrying ${operationName} (attempt ${attempt}/${maxAttempts})${contextStr}`);
					await this.sleep(delay);
				}
			}
		}

		const contextStr = context
			? ` - ${JSON.stringify({ ...context, attempts: maxAttempts })}`
			: ` - attempts: ${maxAttempts}`;
		this.logger.error(`${operationName} failed after ${maxAttempts} attempts${contextStr}`);

		throw IpfsError.fromError(
			lastError,
			`${operationName} failed after ${maxAttempts} attempts`,
			IpfsErrorType.NETWORK
		);
	}

	// Timeout для операций
	protected async withTimeout<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
		const timeout = this.config.timeout || 30000;
		const abortController = new AbortController();
		const timeoutId = setTimeout(() => abortController.abort(), timeout);

		try {
			const result = await Promise.race([
				operation(),
				new Promise<never>((_, reject) => {
					abortController.signal.addEventListener("abort", () => {
						reject(
							new IpfsError(
								`Operation ${operationName} timed out after ${timeout}ms`,
								IpfsErrorType.TIMEOUT,
								{ type: IpfsErrorType.TIMEOUT, operation: operationName, timeout }
							)
						);
					});
				}),
			]);
			clearTimeout(timeoutId);
			return result;
		} catch (error: Error | unknown) {
			clearTimeout(timeoutId);
			if (error instanceof IpfsError && error.errorType === IpfsErrorType.TIMEOUT) {
				throw IpfsError.fromError(error);
			}
			throw IpfsError.fromError(error, `Operation ${operationName} failed`, IpfsErrorType.OPERATION);
		}
	}

	// Вспомогательная функция для задержки
	protected sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	// Инициализация Redis клиента
	protected async initializeRedis(): Promise<void> {
		if (!this.config.redis) {
			return;
		}

		try {
			this.redisClient = new RedisClientService(
				{
					host: this.config.redis.host,
					port: this.config.redis.port,
				},
				this.logger
			);
			await (this.redisClient as RedisClientService).onModuleInit();
			this.logger.log(
				`Redis client initialized - host: ${this.config.redis.host}, port: ${this.config.redis.port}`
			);
		} catch (error: Error | unknown) {
			this.logger.warn(
				`Failed to initialize Redis client, using in-memory cache - error: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	// Инициализация Prometheus клиента
	protected async initializePrometheus(): Promise<void> {
		if (!this.config.prometheus?.enabled) {
			return;
		}

		try {
			this.prometheusClient = new PrometheusService();

			// Создаем гистограмму для измерения длительности операций
			this.ipfsOperationDuration = this.prometheusClient.createHistogram({
				name: "ipfs_operation_duration_seconds",
				help: "Duration of IPFS operations in seconds",
				labelNames: ["operation", "status"] as const,
				buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
			});

			// Создаем счетчик для подсчета операций
			this.ipfsOperationCounter = this.prometheusClient.createCounter({
				name: "ipfs_operation_total",
				help: "Total number of IPFS operations",
				labelNames: ["operation", "status"] as const,
			});

			this.logger.log("Prometheus client initialized");
		} catch (error: Error | unknown) {
			this.logger.warn(
				`Failed to initialize Prometheus client - error: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	// Получение значения из кэша
	protected async getFromCache<T>(key: string): Promise<T | null> {
		// Проверка in-memory cache
		const cached = this.cache.get(key);
		if (cached && cached.expiresAt > Date.now()) {
			return cached.value as T;
		}
		if (cached) {
			this.cache.delete(key);
		}

		// Проверка Redis cache
		if (this.redisClient) {
			try {
				const value = await this.redisClient.get(key);
				if (value) {
					return JSON.parse(value) as T;
				}
			} catch (error: Error | unknown) {
				this.logger.warn(
					`Failed to get from Redis cache - key: ${key}, error: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}

		return null;
	}

	// Сохранение значения в кэш
	protected async setCache(key: string, value: unknown, ttl = 3600000): Promise<void> {
		// Сохранение в in-memory cache
		this.cache.set(key, {
			value,
			expiresAt: Date.now() + ttl,
		});

		// Сохранение в Redis cache
		if (this.redisClient) {
			try {
				await this.redisClient.set(key, JSON.stringify(value), Math.floor(ttl / 1000));
			} catch (error: Error | unknown) {
				this.logger.warn(
					`Failed to set Redis cache - key: ${key}, error: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
	}

	// Логирование метрик
	protected logMetrics(operation: string, duration: number, size?: number, success = true): void {
		const metrics = {
			operation,
			duration,
			size,
			success,
			timestamp: new Date().toISOString(),
		};

		this.logger.log(`IPFS operation: ${operation} - ${JSON.stringify(metrics)}`);

		// Отправка метрик в Prometheus (если доступен)
		if (this.ipfsOperationDuration && this.ipfsOperationCounter) {
			const status = success ? "success" : "error";
			const durationSeconds = duration / 1000; // Конвертируем миллисекунды в секунды

			this.ipfsOperationDuration.observe({ operation, status }, durationSeconds);
			this.ipfsOperationCounter.inc({ operation, status });
		}
	}
}
