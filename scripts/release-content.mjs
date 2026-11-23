// Token-shaped strings trigger review without printing their contents.
/** @param {string} text */
export function containsCredential(text) {
  return /(?:sk-(?:proj-)?[A-Za-z0-9_-]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|figd_[A-Za-z0-9_-]{30,}|sb_secret_[A-Za-z0-9_-]{30,}|AIza[A-Za-z0-9_-]{30,}|(?:AKIA|ASIA)[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text);
}

export function containsReleaseCredential(text) {
  const media = {
    'image/jpeg': 'ffd8ff', 'image/png': '89504e470d0a1a0a',
    'font/ttf': '00010000', 'font/woff2': '774f4632',
  };
  let embeddedCredential = false;
  const source = text.replace(/data:(image\/jpeg|image\/png|font\/ttf|font\/woff2);base64,([A-Za-z0-9+/]+={0,2})/g,
    (literal, mime, base64) => {
      const bytes = Buffer.from(base64, 'base64');
      if (!bytes.subarray(0, 8).toString('hex').startsWith(media[mime]) || bytes.toString('base64') !== base64) return literal;
      embeddedCredential ||= containsCredential(bytes.toString('latin1'));
      return ' ';
    });
  return embeddedCredential || containsCredential(source);
}
