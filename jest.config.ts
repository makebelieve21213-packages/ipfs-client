import { createDefaultEsmPreset, type JestConfigWithTsJest } from "ts-jest";

/**
 * Конфигурация Jest для @makebelieve21213-packages/ipfs-client
 * Настроена для работы с ESM модулями
 */
const presetConfig = createDefaultEsmPreset({
	tsconfig: {
		module: "ESNext",
		target: "ES2023",
	},
});

const config: JestConfigWithTsJest = {
	...presetConfig,
	displayName: "ipfs-client",
	testEnvironment: "node",
	testRegex: ".*\\.spec\\.ts$",
	rootDir: ".",
	// Verbose output для детальных логов
	verbose: true,
	// Очистка моков между тестами
	clearMocks: true,
	resetMocks: true,
	restoreMocks: true,
	// Игнорируемые папки
	testPathIgnorePatterns: ["/node_modules/", "/dist/", "/coverage/"],
	// Игнорируем dist для устранения дублирования manual mocks
	modulePathIgnorePatterns: ["<rootDir>/dist"],
	// Директория для coverage
	coverageDirectory: "coverage",
	// Reporters для покрытия
	coverageReporters: ["text", "lcov", "html", "json", "clover"],
	// Общие расширения файлов
	moduleFileExtensions: ["js", "json", "ts"],
	// Максимальное количество воркеров для параллельного запуска тестов
	maxWorkers: "50%",
	// Таймаут для тестов (5 секунд)
	testTimeout: 5000,
	// Принудительное завершение процессов после завершения тестов (решает проблему EPERM на Windows)
	forceExit: process.platform === "win32",
	// Настройка алиасов для тестов
	moduleNameMapper: {
		"^(\\.{1,2}/.*)\\.js$": "$1",
		"^src/(.*)\\.js$": "<rootDir>/src/$1",
		"^src/(.*)$": "<rootDir>/src/$1",
		// Моки для внешних модулей
		"^@helia/http$": "<rootDir>/src/__tests__/__mocks__/helia.ts",
		"^@helia/block-brokers$": "<rootDir>/src/__tests__/__mocks__/helia.ts",
		"^@helia/unixfs$": "<rootDir>/src/__tests__/__mocks__/helia.ts",
		"^multiformats$": "<rootDir>/src/__tests__/__mocks__/multiformats.ts",
		"^@makebelieve21213-packages/logger$": "<rootDir>/src/__tests__/__mocks__/logger.ts",
		"^@makebelieve21213-packages/redis-client$": "<rootDir>/src/__tests__/__mocks__/redis-client.ts",
		"^@makebelieve21213-packages/prometheus-client$": "<rootDir>/src/__tests__/__mocks__/prometheus-client.ts",
	},
	// Сборка покрытия кода
	collectCoverageFrom: [
		"src/**/*.ts",
		"!src/**/__tests__/**/*.ts",
		"!src/**/*.spec.ts",
		"!src/**/*.d.ts",
		"!src/index.ts",
		"!src/types/**/*.ts",
	],
	// Высокие пороги покрытия для критичного пакета
	// 100% lines; statements/functions 99%/94% из-за edge-cases (конструкторы, parameter properties)
	coverageThreshold: {
		global: {
			branches: 90,
			functions: 90,
			lines: 100,
			statements: 90,
		},
	},
	// Трансформация ESM модулей из @makebelieve21213-packages
	transformIgnorePatterns: [
		"node_modules/(?!(@makebelieve21213-packages|@nestjs)/)",
	],
	// Файл настройки для тестов
	setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
};

export default config;
