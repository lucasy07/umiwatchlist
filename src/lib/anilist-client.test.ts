import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchAnilistBanner } from "./anilist-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAnilistBanner", () => {
  it("retorna a URL quando há banner", async () => {
    const url = "https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587.jpg";
    mockFetch(async () => jsonResponse({ data: { Media: { bannerImage: url } } }));
    await expect(fetchAnilistBanner(52991)).resolves.toBe(url);
  });

  it("retorna null quando bannerImage é null", async () => {
    mockFetch(async () => jsonResponse({ data: { Media: { bannerImage: null } } }));
    await expect(fetchAnilistBanner(1)).resolves.toBeNull();
  });

  it("retorna null quando Media é null", async () => {
    mockFetch(async () => jsonResponse({ data: { Media: null } }));
    await expect(fetchAnilistBanner(1)).resolves.toBeNull();
  });

  it("retorna null em 404", async () => {
    mockFetch(async () =>
      jsonResponse(
        { data: { Media: null }, errors: [{ message: "Not Found.", status: 404 }] },
        404,
      ),
    );
    await expect(fetchAnilistBanner(1)).resolves.toBeNull();
  });

  it("retorna null em 429", async () => {
    mockFetch(async () => jsonResponse({ errors: [{ message: "Too Many Requests." }] }, 429));
    await expect(fetchAnilistBanner(1)).resolves.toBeNull();
  });

  it("retorna null quando a rede falha", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchAnilistBanner(1)).resolves.toBeNull();
  });

  it("retorna null com JSON inválido", async () => {
    mockFetch(async () => new Response("<html>oops</html>", { status: 200 }));
    await expect(fetchAnilistBanner(1)).resolves.toBeNull();
  });

  it("relança AbortError", async () => {
    mockFetch(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    await expect(fetchAnilistBanner(1)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("envia o idMal no body", async () => {
    const fn = mockFetch(async () => jsonResponse({ data: { Media: { bannerImage: null } } }));
    const controller = new AbortController();
    await fetchAnilistBanner(5114, controller.signal);

    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graphql.anilist.co");
    expect(init.method).toBe("POST");
    expect(init.signal).toBe(controller.signal);
    const body = JSON.parse(init.body as string);
    expect(body.variables).toEqual({ idMal: 5114 });
    expect(body.query).toContain("Media(idMal: $idMal, type: ANIME)");
  });
});
