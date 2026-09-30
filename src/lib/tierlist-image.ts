import umiLockup from "@/assets/umi-lockup.png";
import { TIER_VALUE, compareTierlistOrder, type Anime, type Tier } from "@/lib/anime-storage";

export type TierlistImageFormat = "horizontal" | "story";

export const TIER_ORDER = (Object.keys(TIER_VALUE) as Tier[]).sort(
  (a, b) => TIER_VALUE[b] - TIER_VALUE[a],
);

export type TierlistImageRow = { tier: Tier; items: Anime[] };

/** Every tier S→E, only watched animes with a tier, in tierlist order. Ignores search/filters. */
export function selectTierlistRows(animes: Anime[]): TierlistImageRow[] {
  const sorted = animes
    .filter((anime) => anime.watched && anime.tier !== null)
    .sort(compareTierlistOrder);
  return TIER_ORDER.map((tier) => ({ tier, items: sorted.filter((a) => a.tier === tier) }));
}

type FormatSpec = {
  width: number;
  /** Fixed canvas height; null grows with content. */
  height: number | null;
  pad: number;
  headerH: number;
  headerGap: number;
  labelW: number;
  rowPad: number;
  gap: number;
  emptyRowH: number;
  maxCoverW: number;
  minCoverW: number;
  minFont: number;
};

const SPECS: Record<TierlistImageFormat, FormatSpec> = {
  horizontal: {
    width: 1600,
    height: null,
    pad: 48,
    headerH: 96,
    headerGap: 32,
    labelW: 120,
    rowPad: 16,
    gap: 16,
    emptyRowH: 96,
    maxCoverW: 150,
    minCoverW: 150,
    minFont: 18,
  },
  story: {
    width: 1080,
    height: 1920,
    pad: 56,
    headerH: 104,
    headerGap: 32,
    labelW: 96,
    rowPad: 12,
    gap: 12,
    emptyRowH: 72,
    maxCoverW: 200,
    // Below this a story shown on a phone gets illegible, so tiers truncate with "+N".
    minCoverW: 96,
    minFont: 18,
  },
};

const COVER_STEP = 2;

export type TierlistLayoutRow = {
  tier: Tier;
  y: number;
  h: number;
  cells: Array<{ x: number; y: number }>;
  overflow: { x: number; y: number; count: number } | null;
};

export type TierlistLayout = {
  format: TierlistImageFormat;
  width: number;
  height: number;
  pad: number;
  labelW: number;
  header: { x: number; y: number; w: number; h: number };
  box: { x: number; y: number; w: number; h: number };
  coverW: number;
  coverH: number;
  fontSize: number;
  lineHeight: number;
  nameGap: number;
  rows: TierlistLayoutRow[];
  truncated: boolean;
};

function metrics(spec: FormatSpec, coverW: number) {
  const coverH = Math.round((coverW * 3) / 2);
  const fontSize = Math.max(spec.minFont, Math.round(coverW * 0.13));
  const lineHeight = Math.round(fontSize * 1.25);
  const nameGap = Math.round(fontSize * 0.5);
  const cellH = coverH + nameGap + lineHeight * 2;
  const contentW = spec.width - spec.pad * 2 - spec.labelW - spec.rowPad * 2;
  const perLine = Math.max(1, Math.floor((contentW + spec.gap) / (coverW + spec.gap)));
  return { coverH, fontSize, lineHeight, nameGap, cellH, perLine };
}

function rowHeight(spec: FormatSpec, cellH: number, lines: number): number {
  return lines === 0 ? spec.emptyRowH : spec.rowPad * 2 + lines * cellH + (lines - 1) * spec.gap;
}

/**
 * Pure layout for the exported tierlist. `counts` is the number of animes per tier, in
 * TIER_ORDER. Horizontal grows in height; story shrinks covers to fit 1080×1920 and, at the
 * minimum legible size, shows the first covers of each tier plus a "+N" cell.
 */
export function computeTierlistLayout(
  counts: number[],
  format: TierlistImageFormat,
): TierlistLayout {
  const spec = SPECS[format];
  const available =
    spec.height === null ? Infinity : spec.height - spec.pad * 2 - spec.headerH - spec.headerGap;

  let coverW = spec.maxCoverW;
  let m = metrics(spec, coverW);
  let lines = counts.map((c) => Math.ceil(c / m.perLine));
  const total = (ls: number[]) => ls.reduce((sum, l) => sum + rowHeight(spec, m.cellH, l), 0);

  while (total(lines) > available && coverW - COVER_STEP >= spec.minCoverW) {
    coverW -= COVER_STEP;
    m = metrics(spec, coverW);
    lines = counts.map((c) => Math.ceil(c / m.perLine));
  }

  let truncated = false;
  if (total(lines) > available) {
    // Still too tall at the minimum size: one line per non-empty tier, then hand out the
    // remaining lines round-robin from the top tier down.
    const needed = lines;
    lines = needed.map((l) => Math.min(l, 1));
    let added = true;
    while (added) {
      added = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] >= needed[i]) continue;
        if (total(lines) + m.cellH + spec.gap > available) continue;
        lines[i] += 1;
        added = true;
      }
    }
    truncated = true;
  }

  const rowsH = total(lines);
  const contentH = spec.headerH + spec.headerGap + rowsH;
  const height = spec.height ?? contentH + spec.pad * 2;
  const top = spec.height === null ? spec.pad : Math.round((height - contentH) / 2);
  const boxY = top + spec.headerH + spec.headerGap;
  const cellX0 = spec.pad + spec.labelW + spec.rowPad;

  let y = boxY;
  const rows: TierlistLayoutRow[] = TIER_ORDER.map((tier, i) => {
    const h = rowHeight(spec, m.cellH, lines[i]);
    const capacity = lines[i] * m.perLine;
    const overflowing = counts[i] > capacity;
    const shown = overflowing ? capacity - 1 : counts[i];
    const at = (index: number) => ({
      x: cellX0 + (index % m.perLine) * (coverW + spec.gap),
      y: y + spec.rowPad + Math.floor(index / m.perLine) * (m.cellH + spec.gap),
    });
    const row: TierlistLayoutRow = {
      tier,
      y,
      h,
      cells: Array.from({ length: shown }, (_, index) => at(index)),
      overflow: overflowing ? { ...at(shown), count: counts[i] - shown } : null,
    };
    y += h;
    return row;
  });

  return {
    format,
    width: spec.width,
    height,
    pad: spec.pad,
    labelW: spec.labelW,
    header: { x: spec.pad, y: top, w: spec.width - spec.pad * 2, h: spec.headerH },
    box: { x: spec.pad, y: boxY, w: spec.width - spec.pad * 2, h: rowsH },
    coverW,
    coverH: m.coverH,
    fontSize: m.fontSize,
    lineHeight: m.lineHeight,
    nameGap: m.nameGap,
    rows,
    truncated,
  };
}

function fitChars(measure: (text: string) => number, chars: string[], maxWidth: number): number {
  let k = 0;
  while (k < chars.length && measure(chars.slice(0, k + 1).join("")) <= maxWidth) k++;
  return Math.max(1, k);
}

/** Wraps `text` into at most `maxLines` lines, ending the last one with "…" when it doesn't fit. */
export function truncateToLines(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines - 1) {
    let line = "";
    while (i < words.length) {
      const candidate = line ? `${line} ${words[i]}` : words[i];
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        i++;
        continue;
      }
      if (!line) {
        const chars = Array.from(words[i]);
        const k = fitChars(measure, chars, maxWidth);
        line = chars.slice(0, k).join("");
        words[i] = chars.slice(k).join("");
      }
      break;
    }
    lines.push(line);
  }
  if (i < words.length) {
    const rest = words.slice(i).join(" ");
    if (measure(rest) <= maxWidth) {
      lines.push(rest);
    } else {
      const chars = Array.from(rest);
      let k = chars.length;
      while (k > 0 && measure(`${chars.slice(0, k).join("").trimEnd()}…`) > maxWidth) k--;
      lines.push(`${chars.slice(0, k).join("").trimEnd()}…`);
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Canvas rendering (browser only)

type Theme = {
  background: string;
  card: string;
  border: string;
  foreground: string;
  mutedForeground: string;
  tier: Record<Tier, string>;
  fontSans: string;
  fontDisplay: string;
};

function readTheme(): Theme {
  const root = getComputedStyle(document.documentElement);
  const token = (name: string) => {
    const value = root.getPropertyValue(name).trim();
    if (!value) throw new Error(`Token de tema ${name} ausente`);
    return value;
  };
  // Font families live in `@theme inline`, so they only exist through the utility classes.
  const fontOf = (className: string) => {
    const probe = document.createElement("span");
    probe.className = className;
    probe.setAttribute("aria-hidden", "true");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const family = getComputedStyle(probe).fontFamily;
    probe.remove();
    return family;
  };
  return {
    background: token("--background"),
    card: token("--card"),
    border: token("--border"),
    foreground: token("--foreground"),
    mutedForeground: token("--muted-foreground"),
    tier: Object.fromEntries(
      TIER_ORDER.map((t) => [t, token(`--tier-${t.toLowerCase()}`)]),
    ) as Record<Tier, string>,
    fontSans: fontOf("font-sans"),
    fontDisplay: fontOf("font-display"),
  };
}

const IMAGE_TIMEOUT_MS = 15_000;

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Geração cancelada", "AbortError");
}

/**
 * Loads a cover for canvas use. The tierlist already fetched these URLs without CORS, and
 * Chromium may reuse that opaque cached response and taint the canvas, so http(s) URLs get
 * an extra query param to force a fresh CORS request.
 */
function loadImage(src: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const timer = window.setTimeout(() => reject(new Error("timeout")), IMAGE_TIMEOUT_MS);
    const done = () => window.clearTimeout(timer);
    img.onload = () => {
      done();
      resolve(img);
    };
    img.onerror = () => {
      done();
      reject(new Error(`Falha ao carregar ${src}`));
    };
    signal?.addEventListener("abort", () => {
      done();
      img.src = "";
      reject(new DOMException("Geração cancelada", "AbortError"));
    });
    let url = src;
    try {
      const parsed = new URL(src, window.location.href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        if (parsed.origin !== window.location.origin) parsed.searchParams.set("umi-export", "1");
        url = parsed.toString();
      }
    } catch {
      // Keep the raw src (data:/blob: URLs and the like).
    }
    img.src = url;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  // object-fit: cover
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

export async function renderTierlistImage(
  animes: Anime[],
  format: TierlistImageFormat,
  signal?: AbortSignal,
): Promise<{ blob: Blob; truncated: boolean }> {
  const rows = selectTierlistRows(animes);
  const layout = computeTierlistLayout(
    rows.map((r) => r.items.length),
    format,
  );
  const theme = readTheme();

  const labelFont = Math.round(layout.labelW * 0.42);
  const overflowFont = Math.round(layout.coverW * 0.24);
  const fonts = {
    label: `700 ${labelFont}px ${theme.fontDisplay}`,
    overflow: `700 ${overflowFont}px ${theme.fontDisplay}`,
    name: `500 ${layout.fontSize}px ${theme.fontSans}`,
  };
  const names = rows.flatMap((r) => r.items.map((a) => a.name)).join(" ");
  await Promise.all([
    document.fonts.load(fonts.label, `${TIER_ORDER.join("")} +0123456789`),
    document.fonts.load(fonts.name, `${names}…`),
  ]);
  await document.fonts.ready;
  throwIfAborted(signal);

  const visible = rows.map((row, i) => row.items.slice(0, layout.rows[i].cells.length));
  const [logo, ...covers] = await Promise.allSettled([
    loadImage(umiLockup, signal),
    ...visible.flat().map((anime) => {
      const src = anime.cover ?? anime.imageUrl;
      return src ? loadImage(src, signal) : Promise.reject(new Error("sem capa"));
    }),
  ]);
  throwIfAborted(signal);
  const coverById = new Map<string, HTMLImageElement>();
  visible.flat().forEach((anime, i) => {
    const result = covers[i];
    if (result.status === "fulfilled") coverById.set(anime.id, result.value);
  });

  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível");

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // Header: logo on the left.
  const { header } = layout;
  if (logo.status === "fulfilled") {
    const logoH = header.h;
    const logoW = (logo.value.naturalWidth / logo.value.naturalHeight) * logoH;
    ctx.drawImage(logo.value, header.x, header.y, logoW, logoH);
  }

  // Tier box, clipped to rounded corners like the on-screen list.
  const { box } = layout;
  const radius = Math.round(layout.labelW * 0.16);
  const border = 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, radius);
  ctx.clip();

  const coverRadius = Math.round(layout.coverW * 0.06);
  const barW = Math.round(layout.labelW * 0.08);
  rows.forEach((row, i) => {
    const lr = layout.rows[i];
    ctx.fillStyle = theme.card;
    ctx.fillRect(box.x, lr.y, layout.labelW, lr.h);
    ctx.fillStyle = theme.tier[row.tier];
    ctx.fillRect(box.x, lr.y, barW, lr.h);
    ctx.font = fonts.label;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(row.tier, box.x + barW / 2 + layout.labelW / 2, lr.y + lr.h / 2);

    if (i > 0) {
      ctx.fillStyle = theme.border;
      ctx.fillRect(box.x, lr.y - border / 2, box.w, border);
    }

    lr.cells.forEach((cell, index) => {
      const anime = row.items[index];
      const img = coverById.get(anime.id);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cell.x, cell.y, layout.coverW, layout.coverH, coverRadius);
      ctx.fillStyle = theme.card;
      ctx.fill();
      ctx.clip();
      if (img) drawCover(ctx, img, cell.x, cell.y, layout.coverW, layout.coverH);
      ctx.restore();
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = border;
      ctx.beginPath();
      ctx.roundRect(cell.x, cell.y, layout.coverW, layout.coverH, coverRadius);
      ctx.stroke();

      ctx.font = fonts.name;
      ctx.fillStyle = theme.foreground;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const lines = truncateToLines(
        (text) => ctx.measureText(text).width,
        anime.name,
        layout.coverW,
        2,
      );
      lines.forEach((line, li) => {
        ctx.fillText(
          line,
          cell.x + layout.coverW / 2,
          cell.y + layout.coverH + layout.nameGap + li * layout.lineHeight,
        );
      });
    });

    if (lr.overflow) {
      const { x, y, count } = lr.overflow;
      ctx.beginPath();
      ctx.roundRect(x, y, layout.coverW, layout.coverH, coverRadius);
      ctx.fillStyle = theme.card;
      ctx.fill();
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = border;
      ctx.stroke();
      ctx.font = fonts.overflow;
      ctx.fillStyle = theme.mutedForeground;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`+${count}`, x + layout.coverW / 2, y + layout.coverH / 2);
    }
  });
  ctx.restore();

  ctx.strokeStyle = theme.border;
  ctx.lineWidth = border;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, radius);
  ctx.stroke();

  throwIfAborted(signal);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Falha ao gerar o PNG");
  return { blob, truncated: layout.truncated };
}
