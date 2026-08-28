import { describe, expect, it, vi, beforeEach } from "vitest";
import { apiClient } from "../../src/shared/api/client";

describe("apiClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends requests to the configured api url", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1 }),
    });

    const result = await apiClient("/accounts");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8080/accounts",
      undefined,
    );

    expect(result).toEqual({ id: 1 });
  });

  it("throws an error when the api request fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(apiClient("/accounts")).rejects.toThrow(
      "API request failed with status 500",
    );
  });
});
