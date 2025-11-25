// Типы ошибок IPFS
export enum IpfsErrorType {
	VALIDATION = "VALIDATION",
	NETWORK = "NETWORK",
	TIMEOUT = "TIMEOUT",
	NOT_FOUND = "NOT_FOUND",
	INITIALIZATION = "INITIALIZATION",
	OPERATION = "OPERATION",
	UNKNOWN = "UNKNOWN",
}

// Union тип для ошибок IPFS
export type IpfsErrorCause =
	| { type: IpfsErrorType.VALIDATION; field?: string; value?: unknown }
	| { type: IpfsErrorType.NETWORK; gateway?: string }
	| { type: IpfsErrorType.TIMEOUT; operation?: string; timeout?: number }
	| { type: IpfsErrorType.NOT_FOUND; cid?: string }
	| { type: IpfsErrorType.INITIALIZATION }
	| { type: IpfsErrorType.OPERATION; operation?: string }
	| { type: IpfsErrorType.UNKNOWN };
