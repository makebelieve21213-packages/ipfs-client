export class RedisClientService {
	async onModuleInit(): Promise<void> {
		// Mock implementation
	}

	async onModuleDestroy(): Promise<void> {
		// Mock implementation
	}

	async get(_key: string): Promise<string | null> {
		return null;
	}

	async set(_key: string, _value: string, _ttl?: number): Promise<void> {
		// Mock implementation
	}
}

export default RedisClientService;
