import test from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import {
  decodeRich,
  encodeRich,
  contentMarkdown,
  RICH_PREFIX,
} from "../src/lib/doc-rich-content.ts";
import { docEditorExtensions } from "../src/lib/doc-editor-extensions.ts";
import { parsePageContent } from "../src/lib/doc-rules.ts";
import { normalizedColor } from "../src/lib/doc-rich-extensions.ts";
import { checkDocxBudget,validateDocxExpansion } from "../src/lib/docx-budget.ts";
import JSZip from 'jszip';
import mammoth from 'mammoth';
test("rich content roundtrip preserves formatting, layout, merged cells and Thai", () => {
  const tree = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { textAlign: "center" },
        content: [
          {
            type: "text",
            text: "ภาษาไทย",
            marks: [
              { type: "underline" },
              { type: "strike" },
              { type: "textColor", attrs: { color: "#235ab5" } },
              { type: "highlight", attrs: { color: "#fff0b3" } },
            ],
          },
        ],
      },
      {
        type: "banner",
        attrs: { tone: "info" },
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Notice" }] },
        ],
      },
      {
        type: "columns",
        content: [
          { type: "column", content: [{ type: "paragraph" }] },
          { type: "column", content: [{ type: "paragraph" }] },
        ],
      },
      { type: "toggle", content: [{ type: "paragraph" }] },
    ],
  };
  const value = encodeRich(tree);
  assert.deepEqual(decodeRich(value), tree);
  assert.deepEqual(parsePageContent({ body: value }, "free"), { body: value });
  const node = getSchema(docEditorExtensions(true)).nodeFromJSON(tree);
  node.check();
  assert.match(contentMarkdown(value), /ภาษาไทย/);
  assert.match(contentMarkdown(value), /> Notice/);
});
test("legacy Markdown remains byte-identical and does not become rich until edited", () => {
  const value = "# ทดสอบ\n\n- [x] Ready";
  assert.equal(decodeRich(value), null);
  assert.equal(contentMarkdown(value), value);
});
test("unsafe rich nodes, links, styles and excessive nesting are rejected", () => {
  for (const node of [
    { type: "script" },
    { type: "image", attrs: { src: "javascript:alert(1)" } },
    { type: "paragraph", attrs: { textAlign: "evil" } },
    {
      type: "text",
      text: "x",
      marks: [{ type: "textColor", attrs: { color: "red;position:fixed" } }],
    },
  ])
    assert.throws(() =>
      decodeRich(
        RICH_PREFIX + JSON.stringify({ type: "doc", content: [node] }),
      ),
    );
  let tree: { type: string; content?: unknown[] } = { type: "paragraph" };
  for (let i = 0; i < 35; i++) tree = { type: "blockquote", content: [tree] };
  assert.throws(() =>
    decodeRich(RICH_PREFIX + JSON.stringify({ type: "doc", content: [tree] })),
  );
});
test("safe legacy relative links and pasted RGB colors remain serializable", () => {
  for (const href of ["../guide.md", "docs/setup.md", "tel:+6621234567"])
    assert.doesNotThrow(() =>
      encodeRich({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "link",
                marks: [{ type: "link", attrs: { href } }],
              },
            ],
          },
        ],
      }),
    );
  assert.equal(normalizedColor("rgb(35, 90, 181)", "#202020"), "#235ab5");
  assert.equal(normalizedColor("#d8f3e0", "#202020"), "#d8f3e0");
  assert.equal(normalizedColor("url(javascript:evil)", "#202020"), "#202020");
});
test("DOCX archives are bounded before decompression", async () => {
  assert.throws(() => checkDocxBudget(new ArrayBuffer(10)));
  const b=await new JSZip().file('test.txt','Safe content').generateAsync({type:'arraybuffer',compression:'DEFLATE'}),v=new DataView(b),end=b.byteLength-22,central=v.getUint32(end+16,true);
  await validateDocxExpansion(b);
  v.setUint16(end+8,0,true);v.setUint16(end+10,0,true);assert.throws(()=>checkDocxBudget(b),/directory/);v.setUint16(end+8,1,true);v.setUint16(end+10,1,true);
  v.setUint32(central+24,26*1024*1024,true);assert.throws(()=>checkDocxBudget(b),/25 MB/);
  v.setUint32(central+24,1,true);await assert.rejects(()=>validateDocxExpansion(b),/budget/);
  v.setUint16(central+8,1,true);assert.throws(()=>checkDocxBudget(b),/Password/);
});

test('DOCX conversion preserves a simple document after bounded decompression',async()=>{
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>ภาษาไทย</w:t></w:r></w:p></w:body></w:document>');
  const buffer=await zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'});await validateDocxExpansion(buffer);
  const result=await mammoth.convertToHtml({buffer:Buffer.from(buffer)},{externalFileAccess:false});assert.match(result.value,/ภาษาไทย/);
});
test('live embed and button rendering rejects unsafe URLs before persistence',()=>{
  const schema=getSchema(docEditorExtensions(true));
  const embed=schema.nodes.embed!.create({src:'javascript:alert(1)'});const embedDOM=embed.type.spec.toDOM!(embed);assert.ok(Array.isArray(embedDOM));assert.equal(embedDOM[0],'div');
  const button=schema.nodes.linkButton!.create({href:'javascript:alert(1)',label:'bad'});const buttonDOM=button.type.spec.toDOM!(button);assert.ok(Array.isArray(buttonDOM));assert.equal(buttonDOM[0],'span');
});
