import type { Buffer } from "buffer";

// Метаданные файла
export interface FileMetadata {
	size: number;
	cid: string;
}

// In-memory cache для CID
export interface CacheEntry {
	value: unknown;
	expiresAt: number;
}

// Контракт сервиса IpfsCore
export default interface IpfsCoreServiceDto {
	addFile(data: Uint8Array | string): Promise<string>;
	addJson(obj: object): Promise<string>;
	getFile(cid: string): Promise<Buffer>;
	getFileStream(cid: string): AsyncIterable<Uint8Array>;
	getJson<T = unknown>(cid: string): Promise<T>;
	exists(cid: string): Promise<boolean>;
	pin(cid: string): Promise<void>;
	unpin(cid: string): Promise<void>;
	healthCheck(): Promise<boolean>;
	getFileMetadata(cid: string): Promise<FileMetadata>;
}
