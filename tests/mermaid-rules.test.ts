import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MERMAID_MAX_CHARS,
  MERMAID_CONFIG,
  isMermaidLanguage,
  mermaidSources,
  assertMermaidLimits,
} from '../src/lib/mermaid-rules.ts';
import { encodeRich } from '../src/lib/doc-rich-content.ts';
import { parsePageContent } from '../src/lib/doc-rules.ts';

test('isMermaidLanguage accepts the trimmed, case-insensitive first word only', () => {
  for (const lang of ['mermaid', 'Mermaid', ' mermaid ', 'mermaid title']) {
    assert.equal(isMermaidLanguage(lang), true);
  }
  for (const lang of ['js', '', null, 'mermaidx']) {
    assert.equal(isMermaidLanguage(lang), false);
  }
});

test('mermaidSources finds fences in legacy Markdown', () => {
  assert.deepEqual(
    mermaidSources('a\n\n```mermaid\nflowchart LR\n A-->B\n```\n'),
    ['flowchart LR\n A-->B'],
  );
});

test('mermaidSources walks codeBlock nodes at any depth in rich JSON', () => {
  const value = encodeRich({
    type: 'doc',
    content: [
      {
        type: 'toggle',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'mermaid' },
            content: [{ type: 'text', text: 'graph TD; ก-->ข' }],
          },
        ],
      },
    ],
  });
  assert.deepEqual(mermaidSources(value), ['graph TD; ก-->ข']);
});

test('mermaidSources ignores non-Mermaid fences and code blocks', () => {
  assert.deepEqual(mermaidSources('```js\nconsole.log(1)\n```\n'), []);
});

test('assertMermaidLimits passes at exactly 50,000 characters and throws past it', () => {
  const within = '```mermaid\n' + 'a'.repeat(MERMAID_MAX_CHARS) + '\n```\n';
  assert.doesNotThrow(() => assertMermaidLimits(within));
  const over = '```mermaid\n' + 'a'.repeat(MERMAID_MAX_CHARS + 1) + '\n```\n';
  assert.throws(() => assertMermaidLimits(over), { code: 'E_INVALID_DOC' });
});

test('parsePageContent refuses a Mermaid block over the character limit', () => {
  const over = '```mermaid\n' + 'a'.repeat(MERMAID_MAX_CHARS + 1) + '\n```\n';
  assert.throws(() => parsePageContent({ body: over }, 'free'), { code: 'E_INVALID_DOC' });
});

test('MERMAID_CONFIG is frozen and locked down', () => {
  assert.equal(MERMAID_CONFIG.securityLevel, 'strict');
  assert.equal(MERMAID_CONFIG.htmlLabels, false);
  assert.equal(MERMAID_CONFIG.startOnLoad, false);
  assert.equal(Object.isFrozen(MERMAID_CONFIG), true);
});

test('MERMAID_CONFIG draws without shadow or gradient (DESIGN.md § Elevation & Depth)', () => {
  assert.equal(MERMAID_CONFIG.look, 'classic');
  assert.equal(MERMAID_CONFIG.themeVariables.dropShadow, 'none');
  assert.equal(MERMAID_CONFIG.themeVariables.useGradient, false);
  assert.match(MERMAID_CONFIG.themeVariables.fontFamily, /Anuphan/);
});
