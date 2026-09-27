import { describe, expect, it } from 'vitest';
import { staticImports } from './budgets';

describe('staticImports', () => {
  it('follows static imports and re-exports but not dynamic import()', () => {
    const code = `import{a as b}from"./chunk.js";import"./side.js";export*from"./re.js";const m=import("./lazy.js");`;
    expect(staticImports(code)).toEqual(['./chunk.js', './side.js', './re.js']);
  });
});
