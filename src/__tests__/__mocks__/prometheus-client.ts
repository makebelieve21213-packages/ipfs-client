export class PrometheusService {
	createHistogram(_options: {
		name: string;
		help: string;
		labelNames: readonly string[];
		buckets?: number[];
	}): {
		observe: (labels: Record<string, string>, value: number) => void;
	} {
		return {
			observe: jest.fn(),
		};
	}

	createCounter(_options: { name: string; help: string; labelNames: readonly string[] }): {
		inc: (labels: Record<string, string>) => void;
	} {
		return {
			inc: jest.fn(),
		};
	}
}

export default PrometheusService;
