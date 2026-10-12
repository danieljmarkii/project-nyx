// The auth email templates guard (CUL-219).
//
// `docs/auth-email-templates/` is pasted into the Supabase dashboard by hand, so no
// build ever exercises it. Two edits would break real owners silently: swapping
// `{{ .ConfirmationURL }}` for a hand-built link (the app's PKCE exchange needs the
// `?code=` GoTrue's verify hop produces), and dropping the same-phone line from
// confirm or reset (the verifier lives only on the phone that asked).
import * as fs from 'fs';
import * as path from 'path';

const DIR = path.join(__dirname, '..', 'docs', 'auth-email-templates');
const TEMPLATES = ['confirm-signup.html', 'reset-password.html', 'magic-link.html', 'invite.html'];

function read(name: string): string {
  return fs.readFileSync(path.join(DIR, name), 'utf8');
}

describe('auth email templates', () => {
  it.each(TEMPLATES)('%s links only through ConfirmationURL', (name) => {
    const html = read(name);
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    const authHrefs = hrefs.filter((h) => h !== 'https://getculprit.app');
    expect(authHrefs.length).toBeGreaterThanOrEqual(2);
    for (const href of authHrefs) expect(href).toBe('{{ .ConfirmationURL }}');
  });

  it.each(TEMPLATES)('%s carries no old name and no exclamation mark', (name) => {
    const text = read(name).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
    expect(text).not.toMatch(/\bnyx\b/i);
    expect(text).not.toContain('!');
  });

  it('confirm and reset tell the owner to open the link on the asking phone', () => {
    expect(read('confirm-signup.html')).toContain('Open this on the phone you signed up on.');
    expect(read('reset-password.html')).toContain('Open this on the phone where you asked for it.');
  });
});
