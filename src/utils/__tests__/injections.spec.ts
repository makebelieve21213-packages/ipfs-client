import { IPFS_CONFIG_TOKEN } from "src/utils/injections";

describe("injections", () => {
	describe("IPFS_CONFIG_TOKEN", () => {
		it("должен быть определен", () => {
			expect(IPFS_CONFIG_TOKEN).toBeDefined();
		});

		it("должен быть Symbol", () => {
			expect(typeof IPFS_CONFIG_TOKEN).toBe("symbol");
		});

		it("должен иметь описание", () => {
			expect(IPFS_CONFIG_TOKEN.toString()).toBe("Symbol(IPFS_CONFIG)");
		});
	});
});
