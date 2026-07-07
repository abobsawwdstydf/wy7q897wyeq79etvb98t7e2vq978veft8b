/**
 * Markdown parser for message formatting
 * Supports: bold, italic, code, code blocks, links, tables, headings, blockquotes, lists, hr
 */

export interface ParsedMessage {
  html: string;
  plainText: string;
  mentions: string[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function parseInline(s: string): string {
  let out = s;
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/(?<!\*)\*(?!\*)([^*]+)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  out = out.replace(/(?<!_)_(?!_)([^_]+)(?<!_)_(?!_)/g, '<em>$1</em>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}

/**
 * Parse markdown and mentions in message
 */
export function parseMarkdown(text: string): ParsedMessage {
  if (!text) {
    return { html: '', plainText: '', mentions: [] };
  }

  const mentions: string[] = [];
  const mentionRegex = /@(\w+)/g;
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  const lines = text.split('\n');
  const htmlParts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const escaped = escapeHtml(line);

    // Horizontal rule
    if (/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/.test(line)) {
      htmlParts.push('<hr>');
      i++;
      continue;
    }

    // Headings
    const headingMatch = escaped.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      htmlParts.push(`<h${level}>${parseInline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (/^\s{0,3}>/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i++;
      }
      htmlParts.push(`<blockquote>${quoteLines.map(l => parseInline(escapeHtml(l))).join('<br>')}</blockquote>`);
      continue;
    }

    // Table
    if (/^\s{0,3}\|/.test(line)) {
      const tableRows: string[][] = [];
      while (i < lines.length && /^\s{0,3}\|/.test(lines[i])) {
        const row = lines[i].replace(/^\s{0,3}\|/, '').replace(/\|\s{0,3}$/, '').split('|').map(c => c.trim());
        tableRows.push(row);
        i++;
      }
      if (tableRows.length > 0) {
        const isSep = (row: string[]) => row.every(c => /^\s*:?-{2,}:?\s*$/.test(c));
        const hasSep = tableRows.length > 1 && isSep(tableRows[1]);
        const header = tableRows[0];
        const body = hasSep ? tableRows.slice(2) : tableRows.slice(1);
        htmlParts.push('<table><thead><tr>');
        header.forEach(c => { htmlParts.push(`<th>${parseInline(escapeHtml(c))}</th>`); });
        htmlParts.push('</tr></thead><tbody>');
        body.forEach(row => {
          htmlParts.push('<tr>');
          header.forEach((_, ci) => { htmlParts.push(`<td>${parseInline(escapeHtml(row[ci] || ''))}</td>`); });
          htmlParts.push('</tr>');
        });
        htmlParts.push('</tbody></table>');
      }
      continue;
    }

    // Unordered list
    if (/^\s{0,3}[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s{0,3}[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s{0,3}[-*+]\s/, ''));
        i++;
      }
      htmlParts.push('<ul>' + items.map(item => `<li>${parseInline(escapeHtml(item))}</li>`).join('') + '</ul>');
      continue;
    }

    // Ordered list
    if (/^\s{0,3}\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s{0,3}\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s{0,3}\d+\.\s/, ''));
        i++;
      }
      htmlParts.push('<ol>' + items.map(item => `<li>${parseInline(escapeHtml(item))}</li>`).join('') + '</ol>');
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Text paragraph
    htmlParts.push(`<p>${parseInline(escaped)}</p>`);
    i++;
  }

  // Replace mentions in output
  let html = htmlParts.join('\n');
  html = html.replace(/@(\w+)/g, '<span class="mention" data-username="$1">@$1</span>');

  return {
    html,
    plainText: text,
    mentions: Array.from(new Set(mentions))
  };
}

/**
 * Strip markdown formatting to get plain text
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';

  return text
    .replace(/```[^`]+```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\|/gm, '').replace(/\|$/gm, '')
    .replace(/^\s*:?-{2,}:?\s*$/gm, '')
    .replace(/^[-*+]\s/gm, '')
    .replace(/^\d+\.\s/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/@(\w+)/g, '@$1')
    .trim();
}

/**
 * Validate markdown syntax
 */
export function validateMarkdown(text: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const codeBlockCount = (text.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) errors.push('Unclosed code block');
  const inlineCodeCount = (text.match(/`/g) || []).length;
  if (inlineCodeCount % 2 !== 0) errors.push('Unclosed inline code');
  const boldCount = (text.match(/\*\*/g) || []).length;
  if (boldCount % 2 !== 0) errors.push('Unclosed bold formatting');
  return { valid: errors.length === 0, errors };
}

/**
 * Get preview text (first line, stripped of markdown)
 */
export function getPreviewText(text: string, maxLength: number = 100): string {
  const firstLine = text.split('\n')[0];
  const stripped = stripMarkdown(firstLine);
  if (stripped.length <= maxLength) return stripped;
  return stripped.substring(0, maxLength - 3) + '...';
}
