import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  TIER_VALUE,
  allGenres,
  animeMinutes,
  compareTierlistOrder,
  formatDateBR,
  formatLastChecked,
  formatMinutes,
  formatReleaseDate,
  formatReleaseRelative,
  upcomingEntries,
  formatReleaseLabel,
  isAwardWinning,
  isExcludedFromAverage,
  isNotYetAired,
  isUnreleased,
  mediaMAL,
  mergeChainIntoSeasons,
  shouldReplaceReleaseDate,
  enrichUnreleasedSeasons,
  mergeLegacyUpcoming,
  nextRelease,
  parseJikanDuration,
  primarySeasonIndex,
  releasedSeasons,
  seasonFromChain,
  selectUpcomingStrip,
  seasonMinutes,
  tierFromAverage,
  withReleasedSeasons,
  type Anime,
  type Season,
  type UpcomingSeason,
} from "./anime-storage";
import type { ChainSeason } from "./jikan-chain";

function season(overrides: Partial<Season> = {}): Season {
  return { id: "season-1", name: "Temporada 1", ...overrides };
}

function anime(overrides: Partial<Anime> = {}): Anime {
  return {
    id: "anime-1",
    name: "Anime",
    seasons: [],
    watched: false,
    tier: null,
    tierPosition: null,
    lastCheckedAt: null,
    genres: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("parseJikanDuration", () => {
  it.each([
    ["24 min per ep", 24],
    ["1 hr 47 min", 107],
    ["1 hr", 60],
    ["Unknown", null],
    ["", null],
    [null, null],
    [undefined, null],
    ["30 sec", 1],
  ])("converte %s em %s", (raw, expected) => {
    expect(parseJikanDuration(raw)).toBe(expected);
  });
});

describe("seasonMinutes", () => {
  it("multiplica episódios pela duração", () => {
    expect(seasonMinutes(season({ episodes: 12, durationMin: 24 }))).toBe(288);
  });

  it.each([
    [{ episodes: undefined, durationMin: 24 }],
    [{ episodes: 12, durationMin: undefined }],
    [{ episodes: null, durationMin: 24 }],
    [{ episodes: 12, durationMin: null }],
    [{ episodes: 0, durationMin: 24 }],
    [{ episodes: 12, durationMin: 0 }],
  ])("retorna null para dados incompletos ou zerados", (overrides) => {
    expect(seasonMinutes(season(overrides))).toBeNull();
  });
});

describe("animeMinutes", () => {
  it("soma temporadas completas e conta as incompletas", () => {
    const result = animeMinutes(
      anime({
        seasons: [
          season({ id: "1", episodes: 12, durationMin: 24 }),
          season({ id: "2", episodes: 6, durationMin: 20 }),
          season({ id: "3", episodes: undefined, durationMin: 24 }),
        ],
      }),
    );

    expect(result).toEqual({ minutes: 408, episodes: 18, missing: 1 });
  });

  it("inclui TV, OVA e Special no tempo assistido", () => {
    const result = animeMinutes(
      anime({
        seasons: [
          season({ id: "tv", type: "TV", episodes: 10, durationMin: 20 }),
          season({ id: "ova", type: "OVA", episodes: 2, durationMin: 30 }),
          season({ id: "special", type: "Special", episodes: 1, durationMin: 15 }),
        ],
      }),
    );

    expect(result).toEqual({ minutes: 275, episodes: 13, missing: 0 });
  });

  it("ignora não lançadas: nem somam nem contam como faltando", () => {
    const result = animeMinutes(
      anime({
        seasons: [
          season({ id: "1", episodes: 12, durationMin: 24 }),
          season({ id: "2", unreleased: true, episodes: 12, durationMin: 24 }),
          season({ id: "3", unreleased: true }),
        ],
      }),
    );

    expect(result).toEqual({ minutes: 288, episodes: 12, missing: 0 });
  });
});

describe("formatMinutes", () => {
  it.each([
    [45, "45 min"],
    [60, "1 h"],
    [860, "14 h 20 min"],
    [1440, "1 d"],
    [1500, "1 d 1 h"],
    [0, "0 min"],
    [-20, "0 min"],
    [45.6, "46 min"],
  ])("formata %s como %s", (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });
});

describe("isExcludedFromAverage", () => {
  it.each([
    [season({ type: "TV" }), false],
    [season({ type: "OVA" }), true],
    [season({ type: "Special" }), true],
    [season({ type: "TV Special" }), true],
    [season({ type: "ova" }), true],
    [season({ type: "SPECIAL" }), true],
    [season({ type: undefined }), false],
    [season({ type: null }), false],
    [season({ type: "OVA", includeInAverage: true }), false],
    [season({ type: "TV Special", includeInAverage: true }), false],
    [season({ type: "TV", includeInAverage: false }), true],
  ])("resolve exclusão e override", (input, expected) => {
    expect(isExcludedFromAverage(input)).toBe(expected);
  });
});

describe("TIER_VALUE", () => {
  it("mantém a ordem fixa das tiers", () => {
    // A ordem é travada e não deve ser reindexada.
    expect(TIER_VALUE).toEqual({ S: 5, A: 4, B: 3, C: 2, D: 1, E: 0 });
  });
});

describe("tierFromAverage", () => {
  it.each([
    [9, "S"],
    [9.5, "S"],
    [8, "A"],
    [7, "B"],
    [5, "C"],
    [6.9, "C"],
    [4.9, "D"],
    [3, "D"],
    [2.9, "E"],
    [0, "E"],
  ] as const)("converte %s para %s", (average, expected) => {
    expect(tierFromAverage(average)).toBe(expected);
  });
});

describe("mediaMAL", () => {
  it("calcula a média aritmética das notas disponíveis", () => {
    expect(mediaMAL([season({ malScore: 8 }), season({ malScore: 10 })])).toBe(9);
  });

  it("ignora temporadas sem nota e retorna null quando não há notas", () => {
    expect(mediaMAL([season(), season({ malScore: 8 })])).toBe(8);
    expect(mediaMAL([season(), season({ malScore: null })])).toBeNull();
  });

  it("exclui OVA e Special do cálculo", () => {
    expect(
      mediaMAL([
        season({ type: "TV", malScore: 8 }),
        season({ type: "OVA", malScore: 2 }),
        season({ type: "Special", malScore: 3 }),
      ]),
    ).toBe(8);
  });

  it("respeita includeInAverage nas duas direções", () => {
    expect(
      mediaMAL([
        season({ type: "TV", malScore: 10, includeInAverage: false }),
        season({ type: "OVA", malScore: 6, includeInAverage: true }),
      ]),
    ).toBe(6);
  });

  it("exclui não lançadas mesmo com nota", () => {
    expect(
      mediaMAL([
        season({ type: "TV", malScore: 8 }),
        season({ type: "TV", malScore: 2, unreleased: true }),
      ]),
    ).toBe(8);
    expect(mediaMAL([season({ malScore: 9, unreleased: true })])).toBeNull();
  });
});

describe("temporadas não lançadas", () => {
  it("isUnreleased só vale com o marcador", () => {
    expect(isUnreleased(season())).toBe(false);
    expect(isUnreleased(season({ unreleased: false }))).toBe(false);
    expect(isUnreleased(season({ unreleased: true }))).toBe(true);
  });

  it("releasedSeasons filtra e preserva a referência sem não lançadas", () => {
    const released = [season({ id: "1" }), season({ id: "2" })];
    expect(releasedSeasons(released)).toBe(released);
    const mixed = [...released, season({ id: "3", unreleased: true })];
    expect(releasedSeasons(mixed).map((s) => s.id)).toEqual(["1", "2"]);
  });

  it("withReleasedSeasons preserva o objeto sem não lançadas", () => {
    const plain = anime({ seasons: [season()] });
    expect(withReleasedSeasons(plain)).toBe(plain);
    const mixed = anime({ seasons: [season(), season({ id: "u", unreleased: true })] });
    expect(withReleasedSeasons(mixed).seasons).toHaveLength(1);
    expect(mixed.seasons).toHaveLength(2);
  });
});

describe("mergeLegacyUpcoming", () => {
  const makeId = () => "novo";
  const legacy = (overrides: Partial<UpcomingSeason> = {}): UpcomingSeason => ({
    title: "Frieren 2nd Season",
    releaseDate: "2027-01-10",
    source: "auto",
    malId: 100,
    ...overrides,
  });

  it("descarta o legado quando a season de mesmo malId já foi lançada", () => {
    const seasons = [season({ id: "a", malId: 100 })];
    expect(mergeLegacyUpcoming(seasons, legacy(), makeId)).toBe(seasons);
  });

  it("atualiza a data da não lançada de mesmo malId e não duplica", () => {
    const seasons = [season({ id: "a", malId: 100, unreleased: true, releaseDate: "2026-12-01" })];
    const merged = mergeLegacyUpcoming(seasons, legacy(), makeId);
    expect(merged).toEqual([
      season({ id: "a", malId: 100, unreleased: true, releaseDate: "2027-01-10" }),
    ]);
  });

  it("mantém o array quando a não lançada já tem a mesma data", () => {
    const seasons = [season({ id: "a", malId: 100, unreleased: true, releaseDate: "2027-01-10" })];
    expect(mergeLegacyUpcoming(seasons, legacy(), makeId)).toBe(seasons);
  });

  it("adiciona não lançada sem precisão quando não há correspondente", () => {
    const seasons = [season({ id: "a", malId: 1 })];
    expect(mergeLegacyUpcoming(seasons, legacy(), makeId)).toEqual([
      seasons[0],
      {
        id: "novo",
        name: "Frieren 2nd Season",
        malId: 100,
        unreleased: true,
        releaseDate: "2027-01-10",
        releasePrecision: null,
      },
    ]);
  });

  it("aceita legado manual sem malId e deduplica por nome + data", () => {
    const manual = legacy({ malId: undefined, source: undefined, title: "Temporada 3" });
    const once = mergeLegacyUpcoming([], manual, makeId);
    expect(once).toEqual([
      {
        id: "novo",
        name: "Temporada 3",
        malId: null,
        unreleased: true,
        releaseDate: "2027-01-10",
        releasePrecision: null,
      },
    ]);
    expect(mergeLegacyUpcoming(once!, manual, makeId)).toBe(once);
    // Mesma data com outro nome não é a mesma temporada.
    expect(mergeLegacyUpcoming(once!, { ...manual, title: "Outra" }, makeId)).toHaveLength(2);
  });

  it("é idempotente", () => {
    const seasons = [season({ id: "a", malId: 1 })];
    const once = mergeLegacyUpcoming(seasons, legacy(), makeId)!;
    const twice = mergeLegacyUpcoming(once, legacy(), makeId);
    expect(twice).toBe(once);
    expect(twice).toEqual(once);
  });

  it.each(["", "data-inválida", "2027-13-45", "2027-01-10T00:00:00Z"])(
    "não converte data inválida (%s)",
    (releaseDate) => {
      expect(mergeLegacyUpcoming([], legacy({ releaseDate }), makeId)).toBeNull();
    },
  );
});

describe("isAwardWinning", () => {
  it.each([
    [["Drama", "Award Winning"], true],
    [[" award winning "], true],
    [["AWARD WINNING"], true],
    [["Drama"], false],
    [[], false],
    [null, false],
  ])("identifica o gênero premiado", (genres, expected) => {
    expect(isAwardWinning(anime({ genres }))).toBe(expected);
  });
});

describe("allGenres", () => {
  it("conta por anime, deduplica e ordena por contagem e nome", () => {
    const result = allGenres([
      anime({ id: "1", genres: ["Drama", "Action", "Drama"] }),
      anime({ id: "2", genres: ["Comedy", "Action"] }),
      anime({ id: "3", genres: ["Drama", "Comedy"] }),
      anime({ id: "4", genres: ["Fantasy"] }),
      anime({ id: "5", genres: null }),
    ]);

    expect(result).toEqual([
      { name: "Action", count: 2 },
      { name: "Comedy", count: 2 },
      { name: "Drama", count: 2 },
      { name: "Fantasy", count: 1 },
    ]);
  });
});

describe("formatReleaseLabel", () => {
  it.each([
    ["2026-09-16", "Hoje"],
    ["2026-09-17", "Amanhã"],
    ["2026-09-20", "Em 4 dias"],
    ["2026-09-15", "Ontem"],
    ["2026-09-12", "Há 4 dias"],
    ["", ""],
    ["data-inválida", ""],
  ])("formata %s como %s", (date, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16, 12));
    expect(formatReleaseLabel(date)).toBe(expected);
  });
});

describe("formatLastChecked", () => {
  it.each([
    [undefined, "Nunca verificado"],
    [null, "Nunca verificado"],
    ["2026-09-16T11:59:30.000Z", "agora mesmo"],
    ["2026-09-16T11:45:00.000Z", "há 15 min"],
    ["2026-09-16T09:00:00.000Z", "há 3 h"],
    ["2026-09-15T06:00:00.000Z", "ontem"],
    ["2026-09-13T12:00:00.000Z", "há 3 dias"],
    ["data-inválida", ""],
  ])("formata a última verificação", (date, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"));
    expect(formatLastChecked(date)).toBe(expected);
  });
});

describe("formatDateBR", () => {
  it("retorna vazio para string vazia", () => {
    expect(formatDateBR("")).toBe("");
  });

  it("preserva uma data inválida", () => {
    expect(formatDateBR("data-inválida")).toBe("data-inválida");
  });

  it("omite o ano com year: false", () => {
    expect(formatDateBR("2026-10-15")).toMatch(/2026/);
    const short = formatDateBR("2026-10-15", { year: false });
    expect(short).toMatch(/^15/);
    expect(short).not.toMatch(/2026/);
  });
});

describe("compareTierlistOrder", () => {
  const ids = (list: Anime[]) => list.map((a) => a.id);

  it("ordena as tiers de S a E, sem tier por último", () => {
    const list = (["E", null, "B", "S", "D", "A", "C"] as const).map((tier, i) =>
      anime({ id: tier ?? "none", tier, tierPosition: i }),
    );
    expect(ids([...list].sort(compareTierlistOrder))).toEqual([
      "S",
      "A",
      "B",
      "C",
      "D",
      "E",
      "none",
    ]);
  });

  it("dentro da tier ordena por tierPosition com null por último", () => {
    const list = [
      anime({ id: "n1", tier: "A", tierPosition: null }),
      anime({ id: "p2", tier: "A", tierPosition: 2 }),
      anime({ id: "p0", tier: "A", tierPosition: 0 }),
      anime({ id: "n2", tier: "A", tierPosition: null }),
      anime({ id: "p1", tier: "A", tierPosition: 1 }),
    ];
    expect(ids([...list].sort(compareTierlistOrder))).toEqual(["p0", "p1", "p2", "n1", "n2"]);
  });

  it("mantém a ordem de entrada em empates", () => {
    const list = ["x", "y", "z"].map((id) => anime({ id, tier: "B", tierPosition: 3 }));
    expect(ids([...list].sort(compareTierlistOrder))).toEqual(["x", "y", "z"]);
    expect(ids([...list].reverse().sort(compareTierlistOrder))).toEqual(["z", "y", "x"]);
  });
});

describe("selectUpcomingStrip", () => {
  const today = () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16, 12));
  };
  const withDate = (id: string, releaseDate: string, source?: "auto" | "manual") =>
    anime({ id, upcoming: { title: `${id} T2`, releaseDate, source } });
  const ids = (animes: Anime[]) => selectUpcomingStrip(animes).map((i) => i.anime.id);

  it("exclui sem upcoming, data inválida e estreia há mais de 7 dias", () => {
    today();
    expect(
      ids([
        anime({ id: "sem" }),
        withDate("invalida", "data-inválida"),
        withDate("vazia", ""),
        withDate("ha-8", "2026-09-08"),
      ]),
    ).toEqual([]);
  });

  it("inclui hoje, há 7 dias e futuras, ordenando por data", () => {
    today();
    const items = selectUpcomingStrip([
      withDate("futuro", "2027-01-10"),
      withDate("hoje", "2026-09-16"),
      withDate("ha-7", "2026-09-09"),
      withDate("amanha", "2026-09-17"),
      withDate("ontem", "2026-09-15"),
    ]);
    expect(items.map((i) => i.anime.id)).toEqual(["ha-7", "ontem", "hoje", "amanha", "futuro"]);
    expect(items.map((i) => i.days)).toEqual([-7, -1, 0, 1, 116]);
  });

  it("vale para source auto, manual e ausente", () => {
    today();
    expect(
      ids([
        withDate("auto", "2026-09-20", "auto"),
        withDate("manual", "2026-09-21", "manual"),
        withDate("legado", "2026-09-22"),
      ]),
    ).toEqual(["auto", "manual", "legado"]);
  });

  const unreleased = (id: string, releaseDate: string, overrides: Partial<Season> = {}) =>
    season({ id, name: `${id} nome`, unreleased: true, releaseDate, ...overrides });

  it("gera um item por temporada não lançada, com janela e ordem", () => {
    today();
    const items = selectUpcomingStrip([
      anime({
        id: "a",
        seasons: [
          season({ id: "lancada" }),
          unreleased("a-futuro", "2027-01-10", { imageUrl: "capa.jpg" }),
          unreleased("a-velha", "2026-09-01"),
          unreleased("a-sem-data", ""),
        ],
      }),
      anime({ id: "b", seasons: [unreleased("b-amanha", "2026-09-17")] }),
    ]);
    // The undated one now comes last, as "Anunciada".
    expect(items.map((i) => i.entry.seasonId)).toEqual(["b-amanha", "a-futuro", "a-sem-data"]);
    expect(items[1].entry).toEqual({
      title: "a-futuro nome",
      releaseDate: "2027-01-10",
      releasePrecision: null,
      imageUrl: "capa.jpg",
      seasonId: "a-futuro",
    });
  });

  it("inclui o legado sem duplicar uma temporada de mesmo malId", () => {
    today();
    const items = selectUpcomingStrip([
      anime({
        id: "dup",
        seasons: [unreleased("s", "2026-09-20", { malId: 7 })],
        upcoming: { title: "dup T2", releaseDate: "2026-09-20", source: "auto", malId: 7 },
      }),
      anime({
        id: "lancada",
        seasons: [season({ malId: 8 })],
        upcoming: { title: "lancada T2", releaseDate: "2026-09-21", source: "auto", malId: 8 },
      }),
      anime({
        id: "so-legado",
        seasons: [unreleased("outra", "2026-09-25", { malId: 9 })],
        upcoming: { title: "so-legado T3", releaseDate: "2026-09-22", source: "auto", malId: 10 },
      }),
    ]);
    expect(items.map((i) => [i.anime.id, i.entry.seasonId])).toEqual([
      ["dup", "s"],
      ["so-legado", null],
      ["so-legado", "outra"],
    ]);
  });
});

describe("nextRelease", () => {
  it("devolve a menor data entre não lançadas e legado", () => {
    expect(
      nextRelease(
        anime({
          seasons: [
            season({ id: "x", unreleased: true, releaseDate: "2027-03-01" }),
            season({ id: "y", unreleased: true, releaseDate: "2027-02-01" }),
          ],
          upcoming: { title: "Legado", releaseDate: "2027-04-01" },
        }),
      )?.seasonId,
    ).toBe("y");
  });

  it("cai no legado quando não há não lançadas", () => {
    expect(
      nextRelease(anime({ upcoming: { title: "Legado", releaseDate: "2027-04-01" } })),
    ).toEqual({
      title: "Legado",
      releaseDate: "2027-04-01",
      releasePrecision: null,
      imageUrl: null,
      seasonId: null,
    });
    expect(nextRelease(anime())).toBeNull();
  });
});

describe("isNotYetAired", () => {
  it("reconhece o status de anunciado da Jikan", () => {
    expect(isNotYetAired("Not yet aired")).toBe(true);
    expect(isNotYetAired("Finished Airing")).toBe(false);
    expect(isNotYetAired("Currently Airing")).toBe(false);
    expect(isNotYetAired(null)).toBe(false);
  });
});

describe("seasonFromChain", () => {
  const chain = (overrides: Partial<ChainSeason> = {}): ChainSeason => ({
    malId: 10,
    title: "Temporada 2",
    year: 2027,
    malScore: 8.1,
    imageUrl: "https://cdn/x.jpg",
    type: "TV",
    status: "Finished Airing",
    airedFrom: "2027-01-08T00:00:00+00:00",
    genres: ["Action"],
    episodes: 12,
    durationMin: 24,
    releaseDate: "2027-01-08",
    releasePrecision: "day",
    ...overrides,
  });

  it("lançada sai no formato de sempre, sem campos de estreia", () => {
    const result = seasonFromChain(chain(), () => "id-1");
    expect(result).toEqual({
      id: "id-1",
      name: "Temporada 2",
      malId: 10,
      year: 2027,
      malScore: 8.1,
      type: "TV",
      episodes: 12,
      durationMin: 24,
      imageUrl: "https://cdn/x.jpg",
    });
    expect(result).not.toHaveProperty("unreleased");
    expect(result).not.toHaveProperty("releaseDate");
    expect(result).not.toHaveProperty("releasePrecision");
  });

  it("não lançada leva a data e a precisão", () => {
    const result = seasonFromChain(
      chain({ status: "Not yet aired", releaseDate: "2027-04-01", releasePrecision: "month" }),
      () => "id-2",
    );
    expect(result).toMatchObject({
      id: "id-2",
      unreleased: true,
      releaseDate: "2027-04-01",
      releasePrecision: "month",
    });
  });

  it("não lançada sem data entra com data nula", () => {
    const result = seasonFromChain(
      chain({ status: "Not yet aired", imageUrl: null, releaseDate: null, releasePrecision: null }),
      () => "id-3",
    );
    expect(result).toMatchObject({
      unreleased: true,
      releaseDate: null,
      releasePrecision: null,
      imageUrl: null,
    });
  });
});

describe("primarySeasonIndex", () => {
  it("pula as não lançadas", () => {
    expect(primarySeasonIndex([season({ id: "a", unreleased: true }), season({ id: "b" })])).toBe(
      1,
    );
  });

  it("usa a primeira quando todas são não lançadas ou a lista é vazia", () => {
    expect(primarySeasonIndex([season({ unreleased: true }), season({ unreleased: true })])).toBe(
      0,
    );
    expect(primarySeasonIndex([])).toBe(0);
  });
});

describe("mergeChainIntoSeasons", () => {
  const link = (malId: number, overrides: Partial<ChainSeason> = {}): ChainSeason => ({
    malId,
    title: `Temporada ${malId}`,
    year: 2027,
    malScore: null,
    imageUrl: null,
    type: "TV",
    status: "Not yet aired",
    airedFrom: null,
    genres: [],
    episodes: null,
    durationMin: null,
    releaseDate: "2027-04-01",
    releasePrecision: "month",
    ...overrides,
  });
  const released = season({ id: "s1", malId: 1, malScore: 8 });
  const none = new Set<number>();
  const makeId = () => "novo";

  it("anunciada nova entra como não lançada, com data e sem data", () => {
    const merge = mergeChainIntoSeasons(
      [released],
      [link(2), link(3, { releaseDate: null, releasePrecision: null })],
      none,
      makeId,
    );
    expect(merge.seasons).toHaveLength(3);
    expect(merge.added).toEqual([
      expect.objectContaining({ malId: 2, unreleased: true, releaseDate: "2027-04-01" }),
      expect.objectContaining({ malId: 3, unreleased: true, releaseDate: null }),
    ]);
    expect(merge.available).toEqual([]);
  });

  it("não lançada com data alterada é reagendada e atualiza a capa", () => {
    const saved = season({
      id: "s2",
      name: "Meu nome",
      malId: 2,
      unreleased: true,
      releaseDate: "2027-04-01",
      releasePrecision: "month",
      imageUrl: null,
    });
    const merge = mergeChainIntoSeasons(
      [released, saved],
      [link(2, { releaseDate: "2027-04-10", releasePrecision: "day", imageUrl: "nova.jpg" })],
      none,
    );
    expect(merge.seasons[1]).toEqual({
      ...saved,
      releaseDate: "2027-04-10",
      releasePrecision: "day",
      imageUrl: "nova.jpg",
    });
    expect(merge.rescheduled).toEqual([merge.seasons[1]]);
  });

  it("não lançada inalterada devolve o mesmo array", () => {
    const saved = season({
      id: "s2",
      malId: 2,
      unreleased: true,
      releaseDate: "2027-04-01",
      releasePrecision: "month",
      imageUrl: null,
    });
    const seasons = [released, saved];
    const merge = mergeChainIntoSeasons(seasons, [link(2)], none);
    expect(merge.seasons).toBe(seasons);
    expect(merge.rescheduled).toEqual([]);
  });

  it("não lançada que estreou vira temporada normal e preserva id, nome e includeInAverage", () => {
    const saved = season({
      id: "s2",
      name: "Nome editado",
      malId: 2,
      includeInAverage: true,
      unreleased: true,
      releaseDate: "2027-04-01",
      releasePrecision: "month",
      imageUrl: "velha.jpg",
    });
    const merge = mergeChainIntoSeasons(
      [saved],
      [
        link(2, {
          status: "Currently Airing",
          malScore: 8.4,
          episodes: 12,
          durationMin: 24,
          type: "TV",
          year: 2027,
          imageUrl: null,
        }),
      ],
      none,
    );
    const converted = merge.seasons[0];
    expect(converted).toEqual({
      id: "s2",
      name: "Nome editado",
      malId: 2,
      includeInAverage: true,
      year: 2027,
      malScore: 8.4,
      type: "TV",
      episodes: 12,
      durationMin: 24,
      imageUrl: "velha.jpg",
    });
    expect(converted).not.toHaveProperty("unreleased");
    expect(converted).not.toHaveProperty("releaseDate");
    expect(converted).not.toHaveProperty("releasePrecision");
    expect(merge.premiered).toEqual([converted]);
  });

  it("lançada nova vai para disponíveis sem mudar as seasons", () => {
    const seasons = [released];
    const merge = mergeChainIntoSeasons(seasons, [link(2, { status: "Finished Airing" })], none);
    expect(merge.seasons).toBe(seasons);
    expect(merge.available.map((c) => c.malId)).toEqual([2]);
  });

  it("ignora malId já conhecido e temporada própria já lançada", () => {
    const seasons = [released];
    const merge = mergeChainIntoSeasons(
      seasons,
      [
        link(1, { status: "Finished Airing", malScore: 9 }),
        link(5),
        link(6, { status: "Finished Airing" }),
      ],
      new Set([5, 6]),
    );
    expect(merge.seasons).toBe(seasons);
    expect(merge.added).toEqual([]);
    expect(merge.available).toEqual([]);
  });

  it("não lançada ausente do chain permanece", () => {
    const saved = season({ id: "s9", malId: 9, unreleased: true, releaseDate: "2027-01-01" });
    const merge = mergeChainIntoSeasons([released, saved], [link(2)], none, makeId);
    expect(merge.seasons.slice(0, 2)).toEqual([released, saved]);
  });
});

describe("shouldReplaceReleaseDate", () => {
  const at = (
    releaseDate: string | null,
    releasePrecision: "day" | "month" | "year" | null = null,
  ) => ({ releaseDate, releasePrecision });

  it("precisão maior ou igual substitui", () => {
    expect(shouldReplaceReleaseDate(at("2027-04-01", "month"), at("2027-04-10", "day"))).toBe(true);
    expect(shouldReplaceReleaseDate(at("2027-04-01", "month"), at("2027-03-01", "month"))).toBe(
      true,
    );
    expect(shouldReplaceReleaseDate(at(null), at("2027-01-01", "year"))).toBe(true);
  });

  it("precisão menor e data anterior não substitui", () => {
    expect(shouldReplaceReleaseDate(at("2027-04-10", "day"), at("2027-04-01", "month"))).toBe(
      false,
    );
    expect(shouldReplaceReleaseDate(at("2027-04-01", "month"), at("2027-01-01", "year"))).toBe(
      false,
    );
  });

  it("adiamento substitui mesmo menos preciso", () => {
    expect(shouldReplaceReleaseDate(at("2027-10-01", "month"), at("2028-01-01", "year"))).toBe(
      true,
    );
    expect(shouldReplaceReleaseDate(at("2027-04-10", "day"), at("2027-05-01", "month"))).toBe(true);
  });

  it("data nula nunca apaga", () => {
    expect(shouldReplaceReleaseDate(at("2027-04-10", "day"), at(null))).toBe(false);
    expect(shouldReplaceReleaseDate(at(null), at(null))).toBe(false);
  });

  it("mesma data e precisão não é mudança", () => {
    expect(shouldReplaceReleaseDate(at("2027-04-01", "month"), at("2027-04-01", "month"))).toBe(
      false,
    );
  });

  it("data de precisão desconhecida vale como dia", () => {
    expect(shouldReplaceReleaseDate(at("2027-04-10"), at("2027-04-01", "month"))).toBe(false);
    expect(shouldReplaceReleaseDate(at("2027-04-01", "month"), at("2027-04-10"))).toBe(true);
  });
});

describe("mergeChainIntoSeasons com regra de data", () => {
  const link = (overrides: Partial<ChainSeason>): ChainSeason => ({
    malId: 2,
    title: "Temporada 2",
    year: 2027,
    malScore: null,
    imageUrl: null,
    type: "TV",
    status: "Not yet aired",
    airedFrom: null,
    genres: [],
    episodes: null,
    durationMin: null,
    releaseDate: null,
    releasePrecision: null,
    ...overrides,
  });
  const saved = season({
    id: "s2",
    malId: 2,
    unreleased: true,
    releaseDate: "2027-04-10",
    releasePrecision: "day",
    imageUrl: "capa.jpg",
  });
  const none = new Set<number>();

  it("data menos precisa e anterior não troca nem reagenda", () => {
    const seasons = [saved];
    const merge = mergeChainIntoSeasons(
      seasons,
      [link({ releaseDate: "2027-04-01", releasePrecision: "month" })],
      none,
    );
    expect(merge.seasons).toBe(seasons);
    expect(merge.rescheduled).toEqual([]);
  });

  it("sem data não apaga a data salva, mas a capa nova entra", () => {
    const merge = mergeChainIntoSeasons([saved], [link({ imageUrl: "nova.jpg" })], none);
    expect(merge.seasons[0]).toEqual({ ...saved, imageUrl: "nova.jpg" });
    expect(merge.rescheduled).toEqual([]);
  });

  it("adiamento menos preciso substitui e reagenda", () => {
    const merge = mergeChainIntoSeasons(
      [saved],
      [link({ releaseDate: "2028-01-01", releasePrecision: "year" })],
      none,
    );
    expect(merge.seasons[0]).toMatchObject({ releaseDate: "2028-01-01", releasePrecision: "year" });
    expect(merge.rescheduled).toHaveLength(1);
  });
});

describe("enrichUnreleasedSeasons", () => {
  const found = (malId: number, overrides: Partial<ChainSeason> = {}): ChainSeason => ({
    malId,
    title: `AniList ${malId}`,
    year: 2027,
    malScore: null,
    imageUrl: "anilist.jpg",
    type: "TV",
    status: "Not yet aired",
    airedFrom: null,
    genres: [],
    episodes: null,
    durationMin: null,
    releaseDate: "2027-07-15",
    releasePrecision: "day",
    ...overrides,
  });
  const undated = season({ id: "u", malId: 2, unreleased: true, releaseDate: null });

  it("completa a data de não lançada sem data e reagenda", () => {
    const merge = enrichUnreleasedSeasons([undated], new Map([[2, found(2)]]));
    expect(merge.seasons[0]).toEqual({
      ...undated,
      releaseDate: "2027-07-15",
      releasePrecision: "day",
      imageUrl: "anilist.jpg",
    });
    expect(merge.rescheduled).toEqual([merge.seasons[0]]);
  });

  it("só toca não lançadas", () => {
    const released = season({ id: "r", malId: 2, imageUrl: null });
    const seasons = [released];
    expect(enrichUnreleasedSeasons(seasons, new Map([[2, found(2)]])).seasons).toBe(seasons);
  });

  it("não converte em lançada mesmo com status lançado", () => {
    const merge = enrichUnreleasedSeasons(
      [undated],
      new Map([[2, found(2, { status: "Currently Airing" })]]),
    );
    expect(merge.seasons[0].unreleased).toBe(true);
  });

  it("data mais precisa e não anterior substitui a vaga", () => {
    const vague = { ...undated, releaseDate: "2027-07-01", releasePrecision: "month" as const };
    const merge = enrichUnreleasedSeasons([vague], new Map([[2, found(2)]]));
    expect(merge.seasons[0]).toMatchObject({ releaseDate: "2027-07-15", releasePrecision: "day" });
  });

  it("mesma precisão, menos precisa ou anterior não troca a data", () => {
    const vague = {
      ...undated,
      releaseDate: "2027-07-01",
      releasePrecision: "month" as const,
      imageUrl: "mal.jpg",
    };
    for (const other of [
      found(2, { releaseDate: "2027-10-01", releasePrecision: "month" }),
      found(2, { releaseDate: "2028-01-01", releasePrecision: "year" }),
      found(2, { releaseDate: "2027-06-20", releasePrecision: "day" }),
    ]) {
      const seasons = [vague];
      const merge = enrichUnreleasedSeasons(seasons, new Map([[2, other]]));
      expect(merge.seasons).toBe(seasons);
      expect(merge.rescheduled).toEqual([]);
    }
  });

  it("capa só preenche quando ausente", () => {
    const withCover = { ...undated, releaseDate: "2027-07-15", releasePrecision: "day" as const };
    const covered = { ...withCover, imageUrl: "mal.jpg" };
    expect(enrichUnreleasedSeasons([covered], new Map([[2, found(2)]])).seasons[0].imageUrl).toBe(
      "mal.jpg",
    );
    const merge = enrichUnreleasedSeasons([withCover], new Map([[2, found(2)]]));
    expect(merge.seasons[0].imageUrl).toBe("anilist.jpg");
    expect(merge.rescheduled).toEqual([]);
  });
});

describe("formatReleaseDate", () => {
  it("respeita a precisão", () => {
    expect(formatReleaseDate("2027-10-01", "day")).toBe("01 de out. de 2027");
    expect(formatReleaseDate("2027-10-01", null)).toBe("01 de out. de 2027");
    expect(formatReleaseDate("2027-10-01", "month")).toBe("out. de 2027");
    expect(formatReleaseDate("2027-01-01", "year")).toBe("2027");
    expect(formatReleaseDate(null, null)).toBe("sem data");
  });
});

describe("formatReleaseRelative", () => {
  it("conta dias só quando o dia é conhecido", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16, 12));
    expect(formatReleaseRelative("2026-09-28", "day")).toBe("Em 12 dias");
    expect(formatReleaseRelative("2026-09-17", null)).toBe("Amanhã");
    expect(formatReleaseRelative("2027-10-01", "month")).toBe("out. de 2027");
    expect(formatReleaseRelative("2027-01-01", "year")).toBe("2027");
  });
});

describe("selectUpcomingStrip com precisão", () => {
  const at = (date: Date) => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  };
  const vague = (id: string, releaseDate: string, releasePrecision: "day" | "month" | "year") =>
    anime({
      id,
      seasons: [season({ id: `${id}-s`, unreleased: true, releaseDate, releasePrecision })],
    });
  const ids = (animes: Anime[]) => selectUpcomingStrip(animes).map((i) => i.anime.id);

  it("mês em andamento fica até o fim do mês e mês encerrado sai", () => {
    at(new Date(2026, 8, 30, 12));
    expect(ids([vague("set", "2026-09-01", "month"), vague("ago", "2026-08-01", "month")])).toEqual(
      ["set"],
    );
    at(new Date(2026, 9, 1, 12));
    expect(ids([vague("set", "2026-09-01", "month")])).toEqual([]);
  });

  it("ano em andamento fica, e dia há 8 dias sai", () => {
    at(new Date(2026, 8, 16, 12));
    expect(ids([vague("ano", "2026-01-01", "year"), vague("ha-8", "2026-09-08", "day")])).toEqual([
      "ano",
    ]);
  });

  it("mês ou ano já iniciado continua com precisão vaga, nunca como estreia de dia", () => {
    at(new Date(2026, 8, 16, 12));
    const [item] = selectUpcomingStrip([vague("set", "2026-09-01", "month")]);
    expect(item.days).toBeLessThan(0);
    expect(item.entry.releasePrecision).toBe("month");
    expect(formatReleaseRelative(item.entry.releaseDate, item.entry.releasePrecision)).toBe(
      "set. de 2026",
    );
  });
});

describe("temporadas anunciadas sem data", () => {
  const today = () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16, 12));
  };
  const undated = (id: string, name = `${id} nome`) =>
    season({ id, name, unreleased: true, releaseDate: null, releasePrecision: null });
  const dated = (id: string, releaseDate: string) =>
    season({ id, name: `${id} nome`, unreleased: true, releaseDate });

  it("upcomingEntries inclui a sem data e o legado sem data válida continua fora", () => {
    expect(upcomingEntries(anime({ seasons: [undated("x")] }))).toEqual([
      { title: "x nome", releaseDate: null, releasePrecision: null, imageUrl: null, seasonId: "x" },
    ]);
    expect(upcomingEntries(anime({ upcoming: { title: "Legado", releaseDate: "" } }))).toEqual([]);
  });

  it("nextRelease prefere a com data e cai para a sem data quando é a única", () => {
    expect(
      nextRelease(anime({ seasons: [undated("x"), dated("y", "2027-02-01")] }))?.seasonId,
    ).toBe("y");
    expect(nextRelease(anime({ seasons: [undated("x"), undated("z")] }))?.seasonId).toBe("x");
  });

  it("selectUpcomingStrip põe as sem data no fim, em ordem alfabética estável", () => {
    today();
    const list = [
      anime({ id: "zeta", name: "Zeta", seasons: [undated("z1")] }),
      anime({ id: "alfa", name: "Alfa", seasons: [undated("a2", "B"), undated("a1", "A")] }),
      anime({ id: "data", name: "Data", seasons: [dated("d1", "2026-12-01")] }),
      anime({ id: "cedo", name: "Cedo", seasons: [dated("c1", "2026-09-20")] }),
    ];
    const order = (animes: Anime[]) => selectUpcomingStrip(animes).map((i) => i.entry.seasonId);
    expect(order(list)).toEqual(["c1", "d1", "a1", "a2", "z1"]);
    expect(order([...list].reverse())).toEqual(["c1", "d1", "a1", "a2", "z1"]);
    expect(selectUpcomingStrip(list).map((i) => i.days)).toEqual([4, 76, null, null, null]);
  });

  it("rótulo sem data é Anunciada", () => {
    expect(formatReleaseRelative(null, null)).toBe("Anunciada");
  });
});

describe("ordem de lançamento com datas vagas", () => {
  const today = () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 12));
  };
  const at = (
    id: string,
    releaseDate: string | null,
    releasePrecision: "day" | "month" | "year" | null,
  ) => season({ id, name: id, unreleased: true, releaseDate, releasePrecision });
  const strip = (seasons: Season[]) =>
    selectUpcomingStrip(seasons.map((s) => anime({ id: s.id, name: s.id, seasons: [s] }))).map(
      (i) => i.entry.seasonId,
    );
  const expected = ["15-mar", "mar", "01-out", "out", "2027", "15-jan-28"];
  const sequence = [
    at("15-mar", "2027-03-15", "day"),
    at("mar", "2027-03-01", "month"),
    at("01-out", "2027-10-01", "day"),
    at("out", "2027-10-01", "month"),
    at("2027", "2027-01-01", "year"),
    at("15-jan-28", "2028-01-15", "day"),
  ];

  it("vaga vem depois das mais precisas do mesmo período, em qualquer ordem de entrada", () => {
    today();
    expect(strip(sequence)).toEqual(expected);
    expect(strip([...sequence].reverse())).toEqual(expected);
  });

  it("empate dia × ano no último dia do ano: dia primeiro; legado conta como dia", () => {
    today();
    expect(strip([at("ano", "2027-01-01", "year"), at("dia", "2027-12-31", "day")])).toEqual([
      "dia",
      "ano",
    ]);
    expect(strip([at("ano", "2027-01-01", "year"), at("leg", "2027-12-31", null)])).toEqual([
      "leg",
      "ano",
    ]);
  });

  it("sem data continua no fim", () => {
    today();
    expect(strip([at("sem", null, null), at("2027", "2027-01-01", "year")])).toEqual([
      "2027",
      "sem",
    ]);
  });

  it("nextRelease escolhe 01 de out. de 2027 em vez de 2027 no mesmo anime", () => {
    const seasons = [at("2027", "2027-01-01", "year"), at("01-out", "2027-10-01", "day")];
    expect(nextRelease(anime({ seasons }))?.seasonId).toBe("01-out");
    expect(nextRelease(anime({ seasons: [...seasons].reverse() }))?.seasonId).toBe("01-out");
    expect(
      nextRelease(anime({ seasons: [at("sem", null, null), at("2027", "2027-01-01", "year")] }))
        ?.seasonId,
    ).toBe("2027");
  });
});
