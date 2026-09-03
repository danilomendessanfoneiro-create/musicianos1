// ============================================================================
// Utilitário de cifra: formato "[Acorde]texto", parsing e transposição.
// Ex de entrada:
//   [C]Ao lon[Am]ge daqui [F]nada [G]mais
//   {c: Refrão}
// ============================================================================

export interface ChordProLine {
  type: 'lyric' | 'comment' | 'blank';
  text: string; // para comment: o texto do comentário
  segments?: { chord: string | null; lyric: string }[]; // para lyric
}

const CHORD_REGEX = /\[([^\]]+)\]/g;

const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const FLAT_TO_INDEX: Record<string, number> = {
  Cb: 11, Db: 1, Eb: 3, Fb: 4, Gb: 6, Ab: 8, Bb: 10,
};
const SHARP_TO_INDEX: Record<string, number> = {
  'C#': 1, 'D#': 3, 'E#': 5, 'F#': 6, 'G#': 8, 'A#': 10, 'B#': 0,
};
const NATURAL_TO_INDEX: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** Separa a raiz do acorde (ex: "C#m7/G#" -> raiz "C#", resto "m7/G#") */
function splitChordRoot(chord: string): { root: string; rest: string } {
  const match = chord.match(/^([A-G])(#|b)?/);
  if (!match) return { root: chord, rest: '' };
  const root = match[0];
  return { root, rest: chord.slice(root.length) };
}

function noteToIndex(note: string): number | null {
  if (note.length === 2) {
    if (note in SHARP_TO_INDEX) return SHARP_TO_INDEX[note];
    if (note in FLAT_TO_INDEX) return FLAT_TO_INDEX[note];
  }
  if (note in NATURAL_TO_INDEX) return NATURAL_TO_INDEX[note];
  return null;
}

/**
 * Transpõe um único acorde (raiz + baixo, se houver "/") por N semitons.
 * Mantém sustenidos/bemóis de acordo com a preferência `useFlats`.
 */
export function transposeChord(chord: string, semitones: number, useFlats = false): string {
  if (!semitones) return chord;
  const scale = useFlats ? NOTES_FLAT : NOTES_SHARP;

  const transposeSingleRoot = (input: string): string => {
    const { root, rest } = splitChordRoot(input);
    const idx = noteToIndex(root);
    if (idx === null) return input;
    const newIdx = ((idx + semitones) % 12 + 12) % 12;
    return scale[newIdx] + rest;
  };

  if (chord.includes('/')) {
    const [main, bass] = chord.split('/');
    return `${transposeSingleRoot(main)}/${transposeSingleRoot(bass)}`;
  }
  return transposeSingleRoot(chord);
}

/** Diferença em semitons entre duas notas (ex: fromKey="C", toKey="D" -> 2) */
export function semitoneDiff(fromKey: string, toKey: string): number {
  const fromIdx = noteToIndex(splitChordRoot(fromKey).root);
  const toIdx = noteToIndex(splitChordRoot(toKey).root);
  if (fromIdx === null || toIdx === null) return 0;
  return ((toIdx - fromIdx) % 12 + 12) % 12;
}

export const ALL_KEYS = NOTES_SHARP;
export const MAJOR_KEYS = NOTES_SHARP;
export const MINOR_KEYS = NOTES_SHARP.map((n) => `${n}m`);

/**
 * Normaliza um tom pro formato usado nos seletores do app: raiz em sustenido
 * (nunca bemol) + "m" se for menor. Ex: "Bb" -> "A#", "Gm" -> "Gm", "eb" -> "D#".
 * Aceita "m", "min", "menor" como indicativo de tom menor.
 */
export function normalizeKey(key: string): string {
  const trimmed = key.trim();
  const isMinor = /(^|[^a-z])(m|min|menor)\b/i.test(trimmed.replace(/^[A-G](#|b)?/i, ''));
  const rootMatch = trimmed.match(/^([A-G])(#|b)?/i);
  if (!rootMatch) return key;
  const root = rootMatch[0][0].toUpperCase() + rootMatch[0].slice(1);
  const idx = noteToIndex(root);
  if (idx === null) return key;
  return NOTES_SHARP[idx] + (isMinor ? 'm' : '');
}

/** Transpõe um tom (ex: "G", "Am", "F#m") por N semitons — mesma regra de transposeChord */
export function transposeKey(key: string, semitones: number, useFlats = false): string {
  return transposeChord(key, semitones, useFlats);
}

/** Parseia o corpo em formato ChordPro simplificado em linhas estruturadas */
export function parseChordPro(body: string): ChordProLine[] {
  return body.split('\n').map((rawLine) => {
    const commentMatch = rawLine.match(/^\{c:\s*(.*)\}$/i) || rawLine.match(/^#\s*(.*)$/);
    if (commentMatch) {
      return { type: 'comment', text: commentMatch[1] };
    }
    if (rawLine.trim() === '') {
      return { type: 'blank', text: '' };
    }

    const segments: { chord: string | null; lyric: string }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    CHORD_REGEX.lastIndex = 0;
    let pendingChord: string | null = null;

    while ((match = CHORD_REGEX.exec(rawLine)) !== null) {
      const lyricChunk = rawLine.slice(lastIndex, match.index);
      if (lyricChunk || pendingChord !== null) {
        segments.push({ chord: pendingChord, lyric: lyricChunk });
      }
      pendingChord = match[1];
      lastIndex = CHORD_REGEX.lastIndex;
    }
    const tail = rawLine.slice(lastIndex);
    segments.push({ chord: pendingChord, lyric: tail });

    return { type: 'lyric', text: rawLine, segments };
  });
}

/** Transpõe todos os acordes de um corpo ChordPro inteiro */
export function transposeChordProBody(body: string, semitones: number, useFlats = false): string {
  if (!semitones) return body;
  return body.replace(CHORD_REGEX, (_, chord) => `[${transposeChord(chord, semitones, useFlats)}]`);
}
