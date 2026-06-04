/**
 * Markdown parser for message formatting
 * Supports: bold, italic, code, code blocks, links
 */

export interface ParsedMessage {
  html: string;
  plainText: string;
  mentions: string[]; // Array of mentioned usernames
}

/**
 * Parse markdown and mentions in message
 */
export function parseMarkdown(text: string): ParsedMessage {
  if (!text) {
    return { html: '', plainText: '', mentions: [] };
  }

  let html = text;
  const mentions: string[] = [];

  // Escape HTML to prevent XSS
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // Extract mentions (@username)
  const mentionRegex = /@(\w+)/g;
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  // Replace mentions with styled spans
  html = html.replace(/@(\w+)/g, '<span class="mention" data-username="$1">@$1</span>');

  // Code blocks (```code```)
  html = html.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');

  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic (*text* or _text_)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Strikethrough (~~text~~)
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Auto-link URLs
  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return {
    html,
    plainText: text,
    mentions: Array.from(new Set(mentions)) // Remove duplicates
  };
}

/**
 * Strip markdown formatting to get plain text
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';

  return text
    .replace(/```[^`]+```/g, '') // Remove code blocks
    .replace(/`[^`]+`/g, '') // Remove inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1') // Remove strikethrough
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links, keep text
    .replace(/@(\w+)/g, '@$1') // Keep mentions
    .trim();
}

/**
 * Validate markdown syntax
 */
export function validateMarkdown(text: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for unclosed code blocks
  const codeBlockCount = (text.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    errors.push('Unclosed code block');
  }

  // Check for unclosed inline code
  const inlineCodeCount = (text.match(/`/g) || []).length;
  if (inlineCodeCount % 2 !== 0) {
    errors.push('Unclosed inline code');
  }

  // Check for unclosed bold
  const boldCount = (text.match(/\*\*/g) || []).length;
  if (boldCount % 2 !== 0) {
    errors.push('Unclosed bold formatting');
  }

  // Check for unclosed italic
  const italicCount = (text.match(/(?<!\*)\*(?!\*)/g) || []).length;
  if (italicCount % 2 !== 0) {
    errors.push('Unclosed italic formatting');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get preview text (first line, stripped of markdown)
 */
export function getPreviewText(text: string, maxLength: number = 100): string {
  const firstLine = text.split('\n')[0];
  const stripped = stripMarkdown(firstLine);
  
  if (stripped.length <= maxLength) {
    return stripped;
  }
  
  return stripped.substring(0, maxLength - 3) + '...';
}
