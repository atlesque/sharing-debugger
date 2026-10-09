import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMetadata } from '../src/metadata';

test('extracts SEO and repeated social metadata, resolves images, decodes entities, and parses JSON-LD', () => {
  const result = extractMetadata(`<html lang="en"><head><title>Example &amp; friends</title><meta name="description" content="A useful page"><meta property="og:title" content="Share title"><meta property="og:description" content="Share description"><meta property="og:url" content="https://example.com/article"><meta property="og:image" content="/cover.jpg"><meta property="og:image" content="/second.jpg"><meta name="twitter:card" content="summary_large_image"><link rel="canonical" href="/article"><script type="application/ld+json">{"@type":"Article"}</script></head><body><h1>Heading</h1></body></html>`, 'https://example.com/article');
  assert.equal(result.title, 'Example & friends'); assert.equal(result.previews.social.title, 'Share title');
  assert.equal(result.previews.social.image, 'https://example.com/cover.jpg'); assert.equal(result.openGraph.length, 5);
  assert.equal(result.canonical, 'https://example.com/article'); assert.equal(result.language, 'en');
  assert.equal(result.structuredData[0].valid, true); assert.deepEqual(result.headings, [{ level: 'h1', text: 'Heading' }]);
  assert.deepEqual(result.warnings, []);
});
test('reports missing, duplicated, noindex, and invalid structured data', () => {
  const result = extractMetadata('<meta name="robots" content="noindex"><meta name="description" content="one"><meta name="description" content="two"><script type="application/ld+json">invalid</script>', 'https://example.com');
  assert.ok(result.warnings.some(value => value.includes('Missing page title')));
  assert.ok(result.warnings.some(value => value.includes('prevents indexing')));
  assert.ok(result.warnings.some(value => value.includes('Multiple description')));
  assert.ok(result.warnings.some(value => value.includes('Invalid JSON-LD')));
});
test('does not return executable URLs in previews', () => {
  const result = extractMetadata('<meta property="og:image" content="javascript:alert(1)"><link rel="canonical" href="data:text/html,evil">', 'https://example.com');
  assert.equal(result.previews.social.image, ''); assert.equal(result.canonical, '');
});
test('missing images stay empty and HTML base URLs are honored', () => {
  assert.equal(extractMetadata('<title>No image</title>', 'https://example.com').previews.social.image, '');
  const result = extractMetadata('<base href="https://cdn.example.com/assets/"><meta property="og:image" content="cover.jpg">', 'https://example.com');
  assert.equal(result.previews.social.image, 'https://cdn.example.com/assets/cover.jpg');
});
