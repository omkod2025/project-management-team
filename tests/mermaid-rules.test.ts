import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MERMAID_MAX_CHARS,
  MERMAID_CONFIG,
  isMermaidLanguage,
  mermaidSources,
  assertMermaidLimits,
  mermaidProblem,
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
  // Mermaid's own error graphic lands in document.body, outside the block.
  assert.equal(MERMAID_CONFIG.suppressErrorRendering, true);
  assert.equal(Object.isFrozen(MERMAID_CONFIG), true);
});

test('MERMAID_CONFIG keeps a diagram from overriding the locked settings through %%{init}%% or frontmatter', () => {
  // Mermaid deletes these keys, at any depth, from every directive. Its own
  // default list stops at the first six; the rest are the house look and the
  // HTML-label switch, which a public reader must not be able to flip.
  assert.deepEqual(
    [...MERMAID_CONFIG.secure].sort(),
    [
      'secure',
      'securityLevel',
      'startOnLoad',
      'maxTextSize',
      'suppressErrorRendering',
      'maxEdges',
      'theme',
      'themeVariables',
      'themeCSS',
      'look',
      'htmlLabels',
      'fontFamily',
      'altFontFamily',
      'darkMode',
    ].sort(),
  );
  assert.equal(Object.isFrozen(MERMAID_CONFIG.secure), true);
});

test('MERMAID_CONFIG draws without shadow or gradient (DESIGN.md § Elevation & Depth)', () => {
  assert.equal(MERMAID_CONFIG.look, 'classic');
  assert.equal(MERMAID_CONFIG.themeVariables.dropShadow, 'none');
  assert.equal(MERMAID_CONFIG.themeVariables.useGradient, false);
  assert.match(MERMAID_CONFIG.themeVariables.fontFamily, /Anuphan/);
});

// D-71: the editor's error says where. Error shapes below are what Mermaid
// 12.3 throws from parse() for these sources.
const parseError = (message: string, firstLine?: number) =>
  Object.assign(new Error(message), firstLine ? { hash: { loc: { first_line: firstLine } } } : {});

test('D-71: a parse error names the line from hash.loc, quoting the source line as typed', () => {
  const source = 'flowchart LR\n  A["กล้อง"] --> B\n  B -->\n  C[x';
  const problem = mermaidProblem(source, parseError(
    "Parse error on line 5:\n...--> B  B -->  C[x\n--------------------^\nExpecting 'SQE', 'PE', got '1'", 4));
  assert.deepEqual(problem, { line: 4, text: '  C[x', detail: "Expecting 'SQE', 'PE', got '1'" });
});

test('D-71: without hash.loc the line comes from the message, clamped to the source', () => {
  const source = 'sequenceDiagram\n  A->>B: hi\n  B-->>';
  assert.equal(mermaidProblem(source, parseError('Parse error on line 3:\nx\n^\nExpecting ACTOR')).line, 3);
  assert.equal(mermaidProblem(source, parseError('Parse error on line 9:\nx\n^\nExpecting ACTOR')).line, 3);
});

test('D-71: no diagram type points at the first line and says what it must name', () => {
  const unknown = Object.assign(new Error('No diagram type detected matching given configuration for text: #test'), { name: 'UnknownDiagramError' });
  const problem = mermaidProblem('\n#test', unknown);
  assert.equal(problem.line, 2);
  assert.equal(problem.text, '#test');
  assert.match(problem.detail, /first line must name the diagram type/);
});

test('D-71: an error with no position still reports its message, and never throws', () => {
  assert.deepEqual(mermaidProblem('pie', new Error('Something odd')), { line: null, text: null, detail: 'Something odd' });
  assert.deepEqual(mermaidProblem('pie', 'not an error'), { line: null, text: null, detail: 'Could not render this diagram.' });
});
