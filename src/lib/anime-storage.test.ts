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
  formatReleaseLabel,
  isAwardWinning,
  isExcludedFromAverage,
  mediaMAL,
  parseJikanDuration,
  selectUpcomingStrip,
  seasonMinutes,
  tierFromAverage,
  type Anime,
  type Season,
} from "./anime-storage";

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
});
