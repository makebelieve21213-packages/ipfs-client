const mockCat = jest.fn();
const mockStat = jest.fn();
const mockStop = jest.fn();

const mockFs = {
	cat: mockCat,
	stat: mockStat,
};

const mockHelia = {
	stop: mockStop,
	pins: undefined,
};

export const createHeliaHTTP = jest.fn(() => Promise.resolve(mockHelia));
export const trustlessGateway = jest.fn(() => ({}));
export const unixfs = jest.fn(() => mockFs);

// Экспортируем моки для использования в тестах
export { mockCat, mockStat, mockStop, mockHelia, mockFs };
