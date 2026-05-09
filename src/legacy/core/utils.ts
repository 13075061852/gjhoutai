// @ts-nocheck
import { ensureLegacyApp } from './app-context';

(function () {
  'use strict';

  const App = ensureLegacyApp();
  const { constants } = App;
  if (!constants) {
    throw new Error('GJHApp constants must be initialized before utils.');
  }

  const utils = {
    normalizeBaseUrl(value) {
      return (value || constants.DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
    },
    escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[ch]));
    },
    markdownLite(value) {
      const text = String(value || '').replace(/\r\n/g, '\n').trim();
      if (!text) return '';

      const escape = (input) => utils.escapeHtml(input);
      const formatInline = (input) => {
        const escaped = escape(input);
        return escaped
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^*]+)\*/g, '<em>$1</em>');
      };
      const isTableSeparator = (line) => /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(line) && line.includes('|');
      const splitTableRow = (line) => {
        return line
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());
      };

      const lines = text.split('\n');
      const blocks = [];
      let i = 0;

      while (i < lines.length) {
        const line = lines[i].trimEnd();
        const trimmed = line.trim();

        if (!trimmed) {
          i += 1;
          continue;
        }

        if (/^---+$/.test(trimmed)) {
          blocks.push('<hr>');
          i += 1;
          continue;
        }

        if (trimmed.includes('|')) {
          const tableLines = [];
          let j = i;
          while (j < lines.length) {
            const candidate = lines[j].trim();
            if (!candidate) break;
            if (!candidate.includes('|') && !isTableSeparator(candidate)) break;
            tableLines.push(candidate);
            j += 1;
          }

          const hasTableSeparator = tableLines.some(isTableSeparator);
          const hasMultipleRows = tableLines.length >= 2;
          const isLikelyTable = hasMultipleRows && (hasTableSeparator || tableLines.every((line) => line.includes('|')));

          if (isLikelyTable) {
            const rows = tableLines.filter((line) => !isTableSeparator(line)).map(splitTableRow);
            if (rows.length >= 2) {
              const header = rows[0];
              const body = rows.slice(1);
              const headHtml = `<thead><tr>${header.map((cell) => `<th>${formatInline(cell)}</th>`).join('')}</tr></thead>`;
              const bodyHtml = `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${formatInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
              blocks.push(`<div class="markdown-table-wrap"><table>${headHtml}${bodyHtml}</table></div>`);
              i = j;
              continue;
            }
          }
        }

        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          blocks.push(`<h${level}>${formatInline(headingMatch[2].trim())}</h${level}>`);
          i += 1;
          continue;
        }

        const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/);
        if (unorderedMatch) {
          const items = [];
          while (i < lines.length) {
            const current = lines[i].trim();
            const match = current.match(/^[-*+]\s+(.+)$/);
            if (!match) break;
            items.push(`<li>${formatInline(match[1].trim())}</li>`);
            i += 1;
          }
          blocks.push(`<ul>${items.join('')}</ul>`);
          continue;
        }

        const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
        if (orderedMatch) {
          const items = [];
          while (i < lines.length) {
            const current = lines[i].trim();
            const match = current.match(/^\d+\.\s+(.+)$/);
            if (!match) break;
            items.push(`<li>${formatInline(match[1].trim())}</li>`);
            i += 1;
          }
          blocks.push(`<ol>${items.join('')}</ol>`);
          continue;
        }

        const paragraph = [];
        while (i < lines.length) {
          const current = lines[i];
          const currentTrimmed = current.trim();
          if (!currentTrimmed) break;
          if (/^---+$/.test(currentTrimmed) || /^(#{1,6})\s+/.test(currentTrimmed) || /^[-*+]\s+/.test(currentTrimmed) || /^\d+\.\s+/.test(currentTrimmed)) {
            break;
          }
          paragraph.push(currentTrimmed);
          i += 1;
        }

        const paragraphHtml = formatInline(paragraph.join(' ')).replace(/\n/g, '<br>');
        blocks.push(`<p>${paragraphHtml}</p>`);
      }

      return blocks.join('');
    },
    maskKey(key) {
      const value = String(key || '').trim();
      if (!value) return '未填写';
      if (value.length <= 8) return `${value.slice(0, 2)}***`;
      return `${value.slice(0, 4)}…${value.slice(-4)}`;
    },
    readJson(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    writeJson(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    downloadUtf8Json(filename, data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
    async copyText(text) {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      return false;
    },
  };

  App.utils = utils;
})();
