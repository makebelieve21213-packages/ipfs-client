import { Injectable, Module } from "@nestjs/common";

@Injectable()
export class LoggerService {
	setContext(_context: string): void {
		// Mock implementation
	}

	log(_message: string): void {
		// Mock implementation
	}

	error(_message: string): void {
		// Mock implementation
	}

	warn(_message: string): void {
		// Mock implementation
	}

	debug(_message: string): void {
		// Mock implementation
	}

	verbose(_message: string): void {
		// Mock implementation
	}
}

@Module({
	providers: [LoggerService],
	exports: [LoggerService],
})
export class LoggerModule {}

export default LoggerModule;
