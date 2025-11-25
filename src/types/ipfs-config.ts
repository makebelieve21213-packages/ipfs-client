import type { createHeliaHTTP } from "@helia/http";

// Конфигурация Redis для кэширования
export interface RedisConfig {
	host: string;
	port: number;
}

// Конфигурация Prometheus для метрик
export interface PrometheusConfig {
	enabled: boolean;
}

// Тип для опций helia (извлекаем из параметров createHeliaHTTP)
type HeliaOptions = Parameters<typeof createHeliaHTTP>[0];

// Конфигурация IPFS модуля
export default interface IpfsConfig {
	// URL gateway или массив URL для failover
	url: string | string[];
	// Timeout для операций в миллисекундах (по умолчанию: 30000)
	timeout?: number;
	retry?: {
		// Максимальное количество попыток (по умолчанию: 3)
		maxAttempts?: number;
		// Начальная задержка в миллисекундах (по умолчанию: 1000)
		delay?: number;
	};
	// Максимальный размер файла в байтах
	maxFileSize?: number;
	// Кастомные опции для создания helia клиента
	heliaOptions?: Partial<HeliaOptions>;
	// Конфигурация Redis для кэширования CID
	redis?: RedisConfig;
	// Конфигурация Prometheus для метрик
	prometheus?: PrometheusConfig;
}
