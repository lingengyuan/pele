import { describe, expect, it } from 'vitest';
import { PeleError, parse, render } from '../../src/index.js';

const accepted = [
  { body: 'A', maxEdges: 0 },
  { body: 'A-->B', maxEdges: 1 },
  { body: 'A-->B-->C', maxEdges: 2 },
  { body: 'A & B --> C & D', maxEdges: 4 },
  { body: 'A-->B-->C-->D-->E-->F', maxEdges: 5 },
];
const rejected = [
  { body: 'A-->B', maxEdges: 0 },
  { body: 'A-->B-->C', maxEdges: 1 },
  { body: 'A-->B-->C-->D', maxEdges: 2 },
  { body: 'A & B --> C & D', maxEdges: 3 },
];

describe.each(['flowchart', 'agentflow-beta'])('%s edge limit', (header) => {
  for (const [api, run] of Object.entries({ parse, render })) {
    it.each(accepted)(`${api} accepts $body at limit $maxEdges`, ({ body, maxEdges }) => {
      expect(() => run(`${header} LR\n${body}`, { maxEdges })).not.toThrow();
    });

    it.each(rejected)(`${api} explains the exceeded limit $maxEdges for $body`, ({ body, maxEdges }) => {
      let caught: unknown;
      try {
        run(`${header} LR\n${body}`, { maxEdges });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(PeleError);
      expect(caught).toMatchObject({
        code: 'limit',
        type: header === 'flowchart' ? 'flowchart' : 'agentflow',
        message: `Edge limit exceeded. The limit is ${maxEdges}.`,
      });
    });
  }
});
