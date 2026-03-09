import { Injectable, Module } from "@nestjs/common";

@Injectable()
export class LoggerService {
	setContext = jest.fn();
	log = jest.fn();
	error = jest.fn();
	warn = jest.fn();
	debug = jest.fn();
	verbose = jest.fn();
	info = jest.fn();
}

@Module({
	providers: [LoggerService],
	exports: [LoggerService],
})
export class LoggerModule {}

export default LoggerModule;
