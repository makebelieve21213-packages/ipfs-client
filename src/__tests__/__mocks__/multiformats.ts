// Мок для multiformats CID класса
class MockCID {
	public readonly version: number;
	private readonly codec: string;
	private readonly multihash: Uint8Array;
	private readonly string: string;

	constructor(version: number, codec: string, multihash: Uint8Array, string: string) {
		this.version = version;
		this.codec = codec;
		this.multihash = multihash;
		this.string = string;
	}

	// Парсит строку CID и возвращает объект CID
	static parse(cidString: string): MockCID {
		if (!cidString || typeof cidString !== "string") {
			throw new Error("CID string must be a non-empty string");
		}

		// CID v0 начинается с "Qm" (base58)
		// Для тестов принимаем любые CID, начинающиеся с "Qm"
		if (cidString.startsWith("Qm")) {
			return new MockCID(0, "dag-pb", new Uint8Array(), cidString);
		}

		// CID v1 начинается с "bafy" (base32)
		// Для тестов принимаем любые CID, начинающиеся с "bafy"
		if (cidString.startsWith("bafy")) {
			return new MockCID(1, "dag-pb", new Uint8Array(), cidString);
		}

		// Для невалидных CID выбрасываем ошибку
		throw new Error(`Invalid CID format: ${cidString}`);
	}

	// Возвращает строковое представление CID
	toString(): string {
		return this.string;
	}

	// Возвращает версию CID
	getVersion(): number {
		return this.version;
	}

	// Возвращает codec
	getCodec(): string {
		return this.codec;
	}

	// Возвращает multihash
	getMultihash(): Uint8Array {
		return this.multihash;
	}
}

export const CID = MockCID;
