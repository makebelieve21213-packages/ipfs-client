// Токены для инжекции зависимостей
import type { InjectionToken } from "@nestjs/common";

export const IPFS_CONFIG_TOKEN: InjectionToken = Symbol("IPFS_CONFIG");
