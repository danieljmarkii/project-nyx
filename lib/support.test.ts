import { buildSupportMailto, formatAppVersion } from './support';

// Pull the decoded subject/body back out of a mailto: URL so assertions read
// against the real content the mail client will show, not the escaped bytes.
function parseMailto(url: string): { recipient: string; subject: string; body: string } {
  const [scheme, query = ''] = url.split('?');
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    const [k, v = ''] = pair.split('=');
    params.set(k, decodeURIComponent(v));
  }
  return {
    recipient: scheme.replace(/^mailto:/, ''),
    subject: params.get('subject') ?? '',
    body: params.get('body') ?? '',
  };
}

describe('formatAppVersion', () => {
  it('formats version + build as "1.0.0 (build 1)"', () => {
    expect(formatAppVersion('1.0.0', '1')).toBe('1.0.0 (build 1)');
  });

  it('accepts a numeric build', () => {
    expect(formatAppVersion('1.2.3', 42)).toBe('1.2.3 (build 42)');
  });

  it('keeps a build of 0 — a valid build number, not a missing one', () => {
    // Guards against a "simplify to test `build` directly" refactor: 0 is falsy,
    // but the string '0' the coercion produces is truthy, so it must survive.
    expect(formatAppVersion('1.0.0', 0)).toBe('1.0.0 (build 0)');
  });

  it('drops the build suffix when the build is missing (never "(build )")', () => {
    expect(formatAppVersion('1.0.0', null)).toBe('1.0.0');
    expect(formatAppVersion('1.0.0', undefined)).toBe('1.0.0');
    expect(formatAppVersion('1.0.0', '')).toBe('1.0.0');
    expect(formatAppVersion('1.0.0', '   ')).toBe('1.0.0');
  });

  it('falls back to "unknown" when the version is unreadable (never blank, §4.5)', () => {
    expect(formatAppVersion(null, '1')).toBe('unknown (build 1)');
    expect(formatAppVersion(undefined, undefined)).toBe('unknown');
    expect(formatAppVersion('', null)).toBe('unknown');
    expect(formatAppVersion('   ', '')).toBe('unknown');
  });

  it('trims surrounding whitespace on both parts', () => {
    expect(formatAppVersion('  1.0.0 ', ' 7 ')).toBe('1.0.0 (build 7)');
  });
});

describe('buildSupportMailto', () => {
  const ctx = { version: '1.0.0', build: '1', platform: 'ios' };

  it('addresses the given recipient', () => {
    expect(buildSupportMailto('support@getculprit.app', ctx)).toMatch(
      /^mailto:support@getculprit\.app\?/,
    );
    expect(parseMailto(buildSupportMailto('support@getculprit.app', ctx)).recipient).toBe(
      'support@getculprit.app',
    );
  });

  it('defaults to a "Culprit support" subject', () => {
    expect(parseMailto(buildSupportMailto('support@getculprit.app', ctx)).subject).toBe(
      'Culprit support',
    );
  });

  it('prefills the body with the app version and platform (spec §D6)', () => {
    const { body } = parseMailto(buildSupportMailto('support@getculprit.app', ctx));
    expect(body).toContain('App version: 1.0.0 (build 1)');
    expect(body).toContain('Platform: ios');
  });

  it('percent-encodes the URL — no raw spaces or newlines leak through', () => {
    const url = buildSupportMailto('support@getculprit.app', ctx);
    // Everything after the "?" is the encoded query; it must not contain a raw
    // space or newline, or some mail clients truncate the body.
    const query = url.split('?')[1];
    expect(query).not.toMatch(/[ \n]/);
    expect(query).toContain('%20'); // "App version" etc. really was encoded
  });

  it('reuses the helper for a [Feedback]-tagged subject that survives encoding (§D8)', () => {
    const url = buildSupportMailto('support@getculprit.app', {
      ...ctx,
      subject: '[Feedback] Culprit',
    });
    // The literal brackets must be escaped in the URL...
    expect(url).not.toContain('[Feedback]');
    // ...but decode back to exactly what the composer intended.
    expect(parseMailto(url).subject).toBe('[Feedback] Culprit');
  });

  it('places an owner-typed note above the diagnostic footer (§D8 feedback)', () => {
    const { body } = parseMailto(
      buildSupportMailto('support@getculprit.app', { ...ctx, body: 'Love the app.' }),
    );
    expect(body.indexOf('Love the app.')).toBeLessThan(body.indexOf('App version:'));
  });

  it('falls back to "unknown" platform rather than an empty label', () => {
    const { body } = parseMailto(
      buildSupportMailto('support@getculprit.app', { version: '1.0.0', build: '1', platform: '' }),
    );
    expect(body).toContain('Platform: unknown');
  });

  it('carries a version-less report honestly ("unknown") rather than blank', () => {
    const { body } = parseMailto(
      buildSupportMailto('support@getculprit.app', {
        version: null,
        build: null,
        platform: 'android',
      }),
    );
    expect(body).toContain('App version: unknown');
  });
});
