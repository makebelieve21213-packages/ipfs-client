import { LoggerService } from "@makebelieve21213-packages/logger";
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";

// Interceptor для логирования метрик IPFS операций
@Injectable()
export default class IpfsMetricsInterceptor implements NestInterceptor {
	constructor(private readonly logger: LoggerService) {
		this.logger.setContext(IpfsMetricsInterceptor.name);
	}

	intercept(context: ExecutionContext, next: CallHandler): ReturnType<NestInterceptor["intercept"]> {
		const request = context.switchToHttp().getRequest();
		const method = request.method;
		const url = request.url;
		const startTime = Date.now();

		// Используем subscribe для логирования метрик
		const observable = next.handle();

		// Логируем метрики через subscribe
		observable.subscribe({
			next: () => {
				const duration = Date.now() - startTime;
				this.logger.log(`[IPFS Metrics] ${method} ${url} - ${duration}ms`);
			},
			error: (error: Error | unknown) => {
				const duration = Date.now() - startTime;
				const errorMessage = error instanceof Error ? error.message : String(error);
				this.logger.error(`[IPFS Metrics] ${method} ${url} - ${duration}ms - ERROR: ${errorMessage}`);
			},
		});

		return observable;
	}
}
