import { describe, expect, it, vi } from "vitest";
import { escalatingFetcher } from "./fetcher";

const URL_UNDER_TEST = "https://shop.example.com/product/123";

describe("escalatingFetcher", () => {
  it("returns the primary result without touching the fallback on success", async () => {
    const primary = vi.fn().mockResolvedValue("<html>ok</html>");
    const fallback = vi.fn();
    const fetch = escalatingFetcher(primary, fallback);

    expect(await fetch(URL_UNDER_TEST)).toBe("<html>ok</html>");
    expect(primary).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("escalates to the fallback when the primary throws a 403", async () => {
    const primary = vi.fn().mockRejectedValue(
      new Error(`GET ${URL_UNDER_TEST} -> 403 Forbidden`),
    );
    const fallback = vi.fn().mockResolvedValue("<html>browser</html>");
    const fetch = escalatingFetcher(primary, fallback);

    expect(await fetch(URL_UNDER_TEST)).toBe("<html>browser</html>");
    expect(fallback).toHaveBeenCalledWith(URL_UNDER_TEST);
  });

  it.each(["401 Unauthorized", "403", "Access Denied", "forbidden"])(
    "escalates on bot-block message %q",
    async (msg) => {
      const primary = vi.fn().mockRejectedValue(new Error(msg));
      const fallback = vi.fn().mockResolvedValue("<html>browser</html>");
      const fetch = escalatingFetcher(primary, fallback);

      expect(await fetch(URL_UNDER_TEST)).toBe("<html>browser</html>");
      expect(fallback).toHaveBeenCalledOnce();
    },
  );

  it.each(["GET url -> 404 Not Found", "GET url -> 500", "network timeout"])(
    "rethrows non-bot-block error %q without launching the fallback",
    async (msg) => {
      const primary = vi.fn().mockRejectedValue(new Error(msg));
      const fallback = vi.fn();
      const fetch = escalatingFetcher(primary, fallback);

      await expect(fetch(URL_UNDER_TEST)).rejects.toThrow(msg);
      expect(fallback).not.toHaveBeenCalled();
    },
  );
});
