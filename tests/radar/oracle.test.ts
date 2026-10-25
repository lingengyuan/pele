import * as reference from '@mermaid-js/parser';
import { describe, expect, it } from 'vitest';
import { RADAR_TOKENS, lexRadar, parseRadar } from '../../src/diagrams/radar/parser.js';
import { PeleError } from '../../src/errors.js';
import { loadCorpus, mutator, random } from '../support/corpus.js';
import { peleTokens, referenceTokens } from '../support/langium.js';
import { loadTestStrings, peleLexer, peleLongerAlts, referenceLongerAlts } from '../support/langium-extra.js';

const FRAGMENTS = [
  'radar-beta', 'radar-beta:', 'radar-beta :', 'title', 'title ', 'accTitle: ', 'accDescr: ', 'accDescr {', 'accDescr {}', '}', '{', '[', ']',
  ':', ' : ', ',', ', ', '"', "'", '"a"', "'b'", '["L"]', '1', '0', '00', '1.5', '0.5', '01', '1.', '.5', '1.2.3', '1e3', '-1',
  '\n', '\r\n', ' ', '\t', '%%', '%% c', '%%{init: {}}%%', '---', '---\n', '\\', 'x', 'A', 'B', 'a-b', 'a_1', '-', '_', 'é', ';',
  '#35;', 'axis', 'axis ', 'curve', 'curve ', 'ticks', 'ticks 5', 'max', 'max 10', 'min', 'min 0', 'graticule', 'graticule polygon',
  'circle', 'polygon', 'showLegend', 'showLegend false', 'true', 'false', 'axis A, B', '\ncurve c{1, 2}', 'curve d{ A: 1, B 2 }',
  'axisx', 'maxi', 'trues',
];

const HEADLESS = /^\s*(?:axis|curve|ticks|min|max|graticule|showLegend|title|accTitle|accDescr)\b/;

const corpus = [
  ...loadCorpus('radar', /radar/),
  ...loadTestStrings('radar', /radar/),
  ...loadTestStrings('radar', HEADLESS).map((s) => (s.includes('radar') ? s : `radar-beta\naxis my-axis, ax1, ax2\n${s}`)),
  'radar-beta',
  'radar-beta\naccDescr {}\naxis A',
  'radar-beta\naccDescr {\naxis A\ncurve c{1}',
  'radar-beta\naccDescr {\n}\naccDescr {\naxis A',
  'radar-beta:',
  'radar-beta :',
  'radar-beta:\naxis A, B["Bee"]\ncurve c{1,2}',
  'radar-beta axis A, B curve c{1, 2} ticks 5 max 10',
  'radar-beta\naxis A,B\ncurve c { B: 2, A 1 }\n',
  'radar-beta\naxis A,B\ncurve c { X: 2, A 1 }\n',
  'radar-beta\ncurve c { X: 2 }\n',
  'radar-beta\naxis A\ncurve c{\n\n1,\n\n2\n\n}, d["D"]{ A:3 }\n',
  'radar-beta\naxis A\ncurve c{1, A 2}',
  'radar-beta\naxis A\ncurve c{}',
  'radar-beta\naxis A\ncurve c{1,}',
  'radar-beta\naxis A\ncurve c{1\n,2}',
  'radar-beta\ntitle T\naxis A',
  'radar-beta title T axis A',
  'radar-beta\n title T %% c\n accTitle: at\n accDescr: ad\naxis A',
  'radar-beta\naxis axis',
  'radar-beta\naxis maxi, min-1, _x, 1a',
  'radar-beta\naxis a-, b',
  'radar-beta\naxis true',
  'radar-beta\naxis circles',
  'radar-beta\nshowLegend true, ticks 3, max 1.5, min 0, graticule polygon',
  'radar-beta\nshowLegend TRUE',
  'radar-beta\nticks 5 ticks 6\nticks 7',
  'radar-beta\nticks 05',
  'radar-beta\nmax 1.2.3',
  'radar-beta\nmax 5.',
  'radar-beta\nmax -5',
  'radar-beta\ngraticule circle polygon',
  'radar-beta\naxis A,\nB',
  'radar-beta\naxis A\n,B',
  'radar-beta\ncurve c\n{1}',
  'radar-beta\naxis A [ "x" ]',
  "radar-beta\naxis A['x\\ny']",
  'radar-betax',
  'radar-beta-x',
  'radar-beta:x',
  'radar-beta: axis A',
  'radar-beta%% c\naxis A',
  'radar-beta\naxis A\ncurve A{A 1}, A{A: 2}',
  'radar-beta\naxis A, A\ncurve c{A 1, A 2}',
  'radar-beta\ncurve c{1} axis A',
  '---\ntitle: x\n---\nradar-beta\naxis A',
  '\n\n  radar-beta  \n\n',
  'radar-beta\naccDescr {\n a\n b\n}\naxis A',
  'radar-beta\ntitle T\ntitle U\n\ntitle',
  'radar-beta\naxis A\ncurve c{ A:: 1 }',
  'radar-beta\naxis A\ncurve c{ 1 2 }',
  'radar-beta\nmax 99999999999999999999999999999999999999',
  'radar-beta\nmax 0.10',
  'radar-beta\ncurve c{00}',
  'radar-beta\ncurve c{0.5.}',
  'radar-beta\ncurve c{0000.5, 12.34.5, 100.25}',
  'radar-beta\ntitle x axis A',
  '%%{init: {"theme":"dark"}}%%\nradar-beta\naxis A %% c\ncurve c{1} %% d\n',
];

// A syntax tree without Langium's bookkeeping. A cross-reference keeps its text, which is all Mermaid reads.
function tree(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tree);
  if (node === null || typeof node !== 'object') return node;
  if ('$refText' in node) return { $refText: node.$refText };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    if (key.startsWith('$') && key !== '$type') continue;
    const value = (node as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = tree(value);
  }
  return out;
}

// Correct only the three name-prefix rules in Mermaid's lexer. Its parser remains the oracle.
const services = reference.createRadarServices().Radar;
const lexer = services.parser.Lexer as unknown as { chevrotainLexer: {
  constructor: new (types: unknown[], config: unknown) => unknown;
  lexerDefinition: { name: string; PATTERN: unknown }[];
  tokenize(src: string): { tokens: { image: string; tokenType: { name: string } }[]; errors: unknown[] };
} };
const types = lexer.chevrotainLexer.lexerDefinition.map((type) => {
  if (type.name === 'TITLE') return { ...type, PATTERN: /[\t ]*title(?![-\w])(?:[\t ][^\n\r]*?(?=%%)|[\t ][^\n\r]*|)/ };
  const pattern = type.name === 'BOOLEAN' ? /true|false/y : type.name === 'GRATICULE' ? /circle|polygon/y : undefined;
  if (pattern === undefined) return type;
  const option = type.name === 'BOOLEAN' ? 'showLegend' : 'graticule';
  return { ...type, LINE_BREAKS: false, PATTERN: { exec(src: string, at: number, tokens: { tokenType: { name: string } }[]) {
    pattern.lastIndex = at;
    const match = pattern.exec(src);
    if (match === null) return null;
    const id = /^\w(?:[-\w]*\w)?/.exec(src.slice(at));
    return id !== null && id[0].length > match[0].length && tokens.at(-1)?.tokenType.name !== option ? null : match;
  } } };
});
lexer.chevrotainLexer = new lexer.chevrotainLexer.constructor(types, { positionTracking: 'full' }) as typeof lexer.chevrotainLexer;
const referenceLex = (src: string): string | null => {
  const { tokens, errors } = lexer.chevrotainLexer.tokenize(src);
  return errors.length > 0 ? null : tokens.map((token) => `${token.tokenType.name} ${JSON.stringify(token.image)}`).join('\n');
};
const peleLex = peleLexer(RADAR_TOKENS, lexRadar);

async function compare(src: string): Promise<void> {
  expect(peleLex(src), `tokens of ${JSON.stringify(src)}`).toBe(referenceLex(src));
  let expected: unknown;
  let expectedError: string | undefined;
  try {
    const result = services.parser.LangiumParser.parse(src);
    if (result.lexerErrors.length > 0 || result.parserErrors.length > 0) throw new Error('Reference syntax error');
    expected = tree(result.value);
  } catch (e) {
    expectedError = String((e as Error).message);
  }
  let actual: unknown;
  let actualError: string | undefined;
  try {
    actual = tree(parseRadar(src));
  } catch (e) {
    if (!(e instanceof PeleError)) throw e;
    actualError = e.message;
  }
  expect(actualError === undefined, `acceptance of ${JSON.stringify(src)}: ${expectedError ?? actualError}`).toBe(
    expectedError === undefined
  );
  if (expectedError === undefined) expect(actual, `tree of ${JSON.stringify(src)}`).toEqual(expected);
}

describe('radar parser against the Mermaid grammar', () => {
  it('uses the same token types in the same order', () => {
    const expected = referenceTokens('createRadarServices', 'Radar');
    expected.find((token) => token.name === 'TITLE')!.pattern = /[\t ]*title(?![-\w])(?:[\t ][^\n\r]*?(?=%%)|[\t ][^\n\r]*|)/.source;
    expect(peleTokens(RADAR_TOKENS)).toEqual(expected);
    expect(peleLongerAlts(RADAR_TOKENS)).toEqual(referenceLongerAlts('createRadarServices', 'Radar'));
  });

  it('agrees on every spec and documentation input', async () => {
    expect(corpus.length).toBeGreaterThan(80);
    for (const src of corpus) await compare(src);
  });

  it('agrees on mutated inputs', async () => {
    const count = Number(process.env.FUZZ ?? 3000);
    const next = mutator(corpus, FRAGMENTS, random(Number(process.env.SEED ?? 7)));
    for (let i = 0; i < count; i++) {
      const src = next();
      if (src.length <= 2000) await compare(src);
    }
  }, 600_000);
});
