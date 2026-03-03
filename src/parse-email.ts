import PostalMime from 'postal-mime';
import type { ParsedEmail } from './types';

export async function parseEmail(rawEmail: ReadableStream<Uint8Array>): Promise<ParsedEmail> {
  const reader = rawEmail.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const parser = new PostalMime();
  const parsed = await parser.parse(combined);

  return {
    from: parsed.from?.address || parsed.from?.name || 'unknown',
    subject: parsed.subject || '(no subject)',
    date: parsed.date || new Date().toISOString(),
    textBody: parsed.text || '',
    htmlBody: parsed.html || '',
  };
}

export function formatContent(email: ParsedEmail): string {
  const body = email.textBody || stripHtml(email.htmlBody) || '(empty body)';
  const prefixHint = detectPrefixHint(email.subject);

  let content = `📧 Email from: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date}`;
  if (prefixHint) {
    content += `\nHint: ${prefixHint}`;
  }
  content += `\n\n---\n${body}`;

  return content;
}

function detectPrefixHint(subject: string): string | null {
  const s = subject.trimStart();
  if (/^TASK:/i.test(s)) return 'task';
  if (/^IDEA:/i.test(s)) return 'idea';
  if (/^NOTE:/i.test(s)) return 'note';
  if (/^(FWD:|Fw:)/i.test(s)) return 'forwarded';
  return null;
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
