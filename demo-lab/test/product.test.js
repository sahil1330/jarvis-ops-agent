import test from 'node:test';
import assert from 'node:assert/strict';
import { captureAnalytics, recommendJobs, validateResumeUpload } from '../src/product.js';

test('accepts a normal PDF resume', () => {
  assert.deepEqual(
    validateResumeUpload({ name: 'resume.pdf', size: 500 * 1024, mimeType: 'application/pdf' }),
    { ok: true, status: 200 },
  );
});

test('accepts an Atlas demo PDF resume around 5 MiB', () => {
  assert.deepEqual(
    validateResumeUpload({ name: 'atlas-candidate.pdf', size: 5 * 1024 * 1024, mimeType: 'application/pdf' }),
    { ok: true, status: 200 },
  );
});

test('rejects a PDF beyond the product upload ceiling', () => {
  assert.equal(
    validateResumeUpload({ name: 'resume.pdf', size: 7 * 1024 * 1024, mimeType: 'application/pdf' }).status,
    413,
  );
});

test('rejects non-PDF resumes', () => {
  assert.equal(validateResumeUpload({ name: 'resume.docx', size: 200_000, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }).status, 415);
});

test('recommendations rank matching roles', () => {
  const results = recommendJobs({ skills: ['TypeScript', 'Node.js'] });
  assert.equal(results[0]?.title, 'Full Stack Engineer');
  assert.equal(results[0]?.score, 2);
});

test('analytics accepts a named event', () => {
  const result = captureAnalytics('resume_uploaded', { source: 'demo' });
  assert.equal(result.accepted, true);
  assert.equal(result.event, 'resume_uploaded');
});
