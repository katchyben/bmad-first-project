import { CancelledError } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { FALLBACK_MESSAGE, NetworkError, ServerError, errorMessage, needsGlobalErrorToast } from './errors';

describe('errorMessage', () => {
  it('returns the envelope message verbatim', () => {
    const body = {
      error: { code: 'state_conflict', message: 'That task is already finished.' },
    };
    expect(errorMessage(body, new Response(null, { status: 409 }))).toBe(
      'That task is already finished.',
    );
    expect(errorMessage(body)).toBe('That task is already finished.');
  });

  it('falls back for a 5xx even when the body has an envelope message', () => {
    const body = { error: { code: 'boom', message: 'Internal detail.' } };
    expect(errorMessage(body, new Response(null, { status: 500 }))).toBe(FALLBACK_MESSAGE);
    expect(errorMessage(new ServerError(500, body))).toBe(FALLBACK_MESSAGE);
  });

  it.each([
    ['plain text', 'Internal Server Error'],
    ['FastAPI default', { detail: 'Not Found' }],
    ['envelope without message', { error: { code: 'not_found' } }],
    ['non-string message', { error: { code: 'x', message: 42 } }],
    ['empty message', { error: { code: 'x', message: '' } }],
    ['null', null],
    ['undefined', undefined],
    ['network failure', new TypeError('Failed to fetch')],
  ])('falls back for a body with no envelope message (%s)', (_label, body) => {
    expect(errorMessage(body, new Response(null, { status: 400 }))).toBe(FALLBACK_MESSAGE);
  });

  it('uses the exact fallback sentence', () => {
    expect(FALLBACK_MESSAGE).toBe('Something went wrong. Try again.');
  });
});

describe('needsGlobalErrorToast', () => {
  it.each<[string, unknown, boolean]>([
    ['500', new ServerError(500, null), true],
    ['501', new ServerError(501, null), true],
    ['gateway 502', new ServerError(502, null), false],
    ['gateway 503', new ServerError(503, null), false],
    ['gateway 504', new ServerError(504, null), false],
    ['cancelled query', new CancelledError(), false],
    ['5xx with an envelope body', new ServerError(500, { error: { code: 'x', message: 'Hi.' } }), true],
    ['string body', 'Internal Server Error', true],
    ['FastAPI default', { detail: 'Not Found' }, true],
    ['envelope', { error: { code: 'state_conflict', message: 'Already done.' } }, false],
    ['network failure', new NetworkError(new TypeError('Failed to fetch')), false],
  ])('%s', (_label, error, expected) => {
    expect(needsGlobalErrorToast(error)).toBe(expected);
  });
});
