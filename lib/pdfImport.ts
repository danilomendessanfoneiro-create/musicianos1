// ============================================================================
// Importador de PDF: extrai texto posicionado do PDF (via pdf.js), detecta
// quais linhas são "linhas de acorde" e as funde com a linha de letra logo
// abaixo, produzindo texto no formato ChordPro ([C]texto) que já usamos
// no editor/visualizador de cifra.
//
// Funciona bem para PDFs com texto selecionável (a maioria dos PDFs gerados
// de páginas de cifra, que normalmente usam fonte monoespaçada). PDFs
// escaneados (imagem) não têm texto extraível e não são suportados aqui.
// ============================================================================

import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const CHORD_TOKEN_REGEX =
  /^[A-G](#|b)?(maj|min|dim|aug|sus|add|m)?\d{0,2}(\([^)]*\))?(\/[A-G](#|b)?)?$/;

const SECTION_WORDS = /^(intro|refr[aã]o|verso|ponte|solo|final|coda|interl[uú]dio|primeira parte|segunda parte)[:.]?$/i;

interface PositionedItem {
  text: string;
  x: number;
  y: number;
}

interface Line {
  y: number;
  items: PositionedItem[];
  raw: string; // reconstruído em grade de colunas (aprox. monoespaçado)
}

function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const chordCount = tokens.filter((t) => CHORD_TOKEN_REGEX.test(t)).length;
  const avgLen = tokens.reduce((s, t) => s + t.length, 0) / tokens.length;
  return chordCount / tokens.length >= 0.7 && avgLen <= 7;
}

function buildLineFromItems(items: PositionedItem[], charWidth: number): string {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const minX = sorted[0]?.x ?? 0;
  let result = '';
  for (const item of sorted) {
    const col = Math.max(0, Math.round((item.x - minX) / charWidth));
    if (col > result.length) result += ' '.repeat(col - result.length);
    result = result.slice(0, col) + item.text + result.slice(col + item.text.length);
  }
  return result;
}

async function extractLines(file: File): Promise<Line[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const allLines: Line[] = [];
  let charWidthSamples: number[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Agrupa itens por linha (mesma coordenada Y, com tolerância)
    const rows = new Map<number, PositionedItem[]>();
    for (const raw of content.items as any[]) {
      if (!raw.str || !raw.str.trim()) continue;
      const x = raw.transform[4];
      const y = Math.round(raw.transform[5]);
      const item: PositionedItem = { text: raw.str, x, y };
      const bucketKey = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      if (!rows.has(bucketKey)) rows.set(bucketKey, []);
      rows.get(bucketKey)!.push(item);

      if (raw.width && raw.str.length > 0) {
        charWidthSamples.push(raw.width / raw.str.length);
      }
    }

    const charWidth = charWidthSamples.length
      ? charWidthSamples.sort((a, b) => a - b)[Math.floor(charWidthSamples.length / 2)] // mediana
      : 5;

    const sortedRows = [...rows.entries()].sort((a, b) => b[0] - a[0]); // Y decrescente = topo pro fim
    for (const [y, items] of sortedRows) {
      allLines.push({ y, items, raw: buildLineFromItems(items, charWidth) });
    }
  }

  return allLines;
}

/** Insere [chord] na posição (coluna) correspondente dentro do texto da letra */
function mergeChordAndLyric(chordLine: string, lyricLine: string): string {
  const matches = [...chordLine.matchAll(/\S+/g)];
  if (matches.length === 0) return lyricLine;

  // insere do fim para o início para não bagunçar os índices
  let result = lyricLine;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const col = Math.min(m.index ?? 0, result.length);
    result = `${result.slice(0, col)}[${m[0]}]${result.slice(col)}`;
  }
  return result;
}

export async function importPdfToChordPro(file: File): Promise<{ body: string; titleGuess: string | null }> {
  const lines = await extractLines(file);
  const out: string[] = [];
  let titleGuess: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i].raw;
    const trimmed = current.trim();

    if (!trimmed) {
      out.push('');
      continue;
    }

    if (SECTION_WORDS.test(trimmed)) {
      out.push(`{c: ${trimmed}}`);
      continue;
    }

    if (isChordLine(current)) {
      const next = lines[i + 1];
      if (next && next.raw.trim() && !isChordLine(next.raw)) {
        out.push(mergeChordAndLyric(current, next.raw));
        i++; // já consumiu a linha de letra
      } else {
        // linha só de acordes sem letra embaixo (ex: intro instrumental)
        out.push(current.trim().split(/\s+/).map((c) => `[${c}]`).join(' '));
      }
      continue;
    }

    // primeira linha "de texto normal" costuma ser o título, no topo do PDF
    if (!titleGuess && i < 5 && trimmed.length < 60) {
      titleGuess = trimmed;
    }

    out.push(current);
  }

  return { body: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), titleGuess };
}
