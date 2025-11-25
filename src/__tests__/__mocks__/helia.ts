const mockAddBytes = jest.fn();
const mockCat = jest.fn();
const mockStat = jest.fn();
const mockStop = jest.fn();
const mockPinsAdd = jest.fn();
const mockPinsRm = jest.fn();

const mockFs = {
	addBytes: mockAddBytes,
	cat: mockCat,
	stat: mockStat,
};

const mockHelia = {
	stop: mockStop,
	pins: {
		add: mockPinsAdd,
		rm: mockPinsRm,
	},
};

export const createHeliaHTTP = jest.fn(() => Promise.resolve(mockHelia));
export const trustlessGateway = jest.fn(() => ({}));
export const unixfs = jest.fn(() => mockFs);

// Экспортируем моки для использования в тестах
export { mockAddBytes, mockCat, mockStat, mockStop, mockPinsAdd, mockPinsRm, mockHelia, mockFs };
