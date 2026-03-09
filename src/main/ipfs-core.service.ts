import { Buffer } from "buffer";

import { Inject, Injectable } from "@nestjs/common";
import HeliaClientService from "src/main/services/helia-client.service";
import IpfsAddService from "src/main/services/ipfs-add.service";
import IpfsCoreInternalService from "src/main/services/ipfs-core-internal.service";
import IpfsPinService from "src/main/services/ipfs-pin.service";
import IpfsReadService from "src/main/services/ipfs-read.service";

import type IpfsCoreServiceDto from "src/types/ipfs-core.interface";
import type { FileMetadata } from "src/types/ipfs-core.interface";

// Сервис фасад, оперирует вызовами пакета
@Injectable()
export default class IpfsCoreService implements IpfsCoreServiceDto {
	constructor(
		@Inject(IpfsCoreInternalService)
		private readonly core: IpfsCoreInternalService,
		@Inject(HeliaClientService)
		private readonly heliaClient: HeliaClientService,
		@Inject(IpfsAddService)
		private readonly addService: IpfsAddService,
		@Inject(IpfsReadService)
		private readonly readService: IpfsReadService,
		@Inject(IpfsPinService)
		private readonly pinService: IpfsPinService
	) {}

	async addFile(data: Uint8Array | string): Promise<string> {
		return this.addService.addFile(data);
	}

	async addJson(obj: object): Promise<string> {
		return this.addService.addJson(obj);
	}

	async getFile(cid: string): Promise<Buffer> {
		return this.readService.getFile(cid);
	}

	async *getFileStream(cid: string): AsyncIterable<Uint8Array> {
		yield* this.readService.getFileStream(cid);
	}

	async getJson<T = unknown>(cid: string): Promise<T> {
		return this.readService.getJson<T>(cid);
	}

	async exists(cid: string): Promise<boolean> {
		return this.readService.exists(cid);
	}

	async pin(cid: string): Promise<void> {
		return this.pinService.pin(cid);
	}

	async unpin(cid: string): Promise<void> {
		return this.pinService.unpin(cid);
	}

	async healthCheck(): Promise<boolean> {
		if (!this.core.isInitialized || !this.heliaClient.kuboApiUrl) {
			return false;
		}
		try {
			const res = await fetch(`${this.heliaClient.kuboApiUrl}/id`, {
				method: "POST",
				signal: AbortSignal.timeout(5000),
			});
			return res.ok;
		} catch {
			return false;
		}
	}

	async getFileMetadata(cid: string): Promise<FileMetadata> {
		return this.readService.getFileMetadata(cid);
	}
}
