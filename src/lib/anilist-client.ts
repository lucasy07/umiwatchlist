const ANILIST_URL = "https://graphql.anilist.co";

const BANNER_QUERY = `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { bannerImage } }`;

function isAbortError(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "AbortError";
}

/** Banner horizontal do AniList para um anime do MAL, ou null se não houver ou der erro. */
export async function fetchAnilistBanner(
  malId: number,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: BANNER_QUERY, variables: { idMal: malId } }),
      signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { Media?: { bannerImage?: unknown } | null } | null;
    } | null;
    const banner = json?.data?.Media?.bannerImage;
    return typeof banner === "string" && banner.trim() !== "" ? banner : null;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}
