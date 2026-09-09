import test from 'node:test';
import assert from 'node:assert/strict';
import { isDocAssetLink, downloadFilename, downloadDocFile } from '../src/lib/doc-download.ts';

test('downloads accept only project asset routes', async () => {
  assert.equal(isDocAssetLink('/api/doc-assets/12345678-1234-1234-1234-123456789abc'), true);
  for (const href of ['https://example.com/file', '//example.com/file', '/api/doc-assets/../users', 'javascript:alert(1)']) {
    assert.equal(isDocAssetLink(href), false);
    await assert.rejects(downloadDocFile(href), /Invalid attachment/);
  }
});
test('download filenames preserve Thai and fall back safely', () => {
  assert.equal(downloadFilename(`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent('เอกสาร.pdf')}`), 'เอกสาร.pdf');
  assert.equal(downloadFilename('attachment; filename="report.pdf"'), 'report.pdf');
  assert.equal(downloadFilename("attachment; filename*=UTF-8''%zz"), 'download');
  assert.equal(downloadFilename(null), 'download');
});
