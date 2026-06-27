import MarkdownIt from 'markdown-it';
import { ensureLegacyApp } from './app-context';
import { setCloudBackedLocalStorageItem } from '../../services/cloud-sync';
import { parseJsonOr } from '../../utils/json';

const SAFE_MARKDOWN_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

const isSafeMarkdownUrl = (value) => {
  const url = String(value || '').trim();
  if (!url) return false;
  if (/^(#|\/(?!\/)|\.{1,2}\/)/.test(url)) return true;

  try {
    const parsed = new URL(url, window.location.origin);
    return SAFE_MARKDOWN_URL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
};

const addUnderlineRule = (md) => {
  md.inline.ruler.before('emphasis', 'underline', (state, silent) => {
    const marker = state.src.slice(state.pos, state.pos + 2);
    if (marker !== '++') return false;

    const start = state.pos + 2;
    const end = state.src.indexOf('++', start);
    if (end < 0 || end === start) return false;

    if (!silent) {
      let token = state.push('ins_open', 'ins', 1);
      token.markup = '++';
      state.md.inline.parse(state.src.slice(start, end), state.md, state.env, state.tokens);
      token = state.push('ins_close', 'ins', -1);
      token.markup = '++';
    }

    state.pos = end + 2;
    return true;
  });
};

const normalizeMarkdownUnderline = (value) => String(value || '')
  .replace(/<u>([\s\S]*?)<\/u>/gi, '++$1++')
  .replace(/<ins>([\s\S]*?)<\/ins>/gi, '++$1++');

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
})
  .enable(['table', 'strikethrough'])
  .use(addUnderlineRule);

markdownRenderer.validateLink = isSafeMarkdownUrl;

const defaultLinkOpen = markdownRenderer.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
markdownRenderer.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const href = token.attrGet('href') || '';
  if (!isSafeMarkdownUrl(href)) {
    token.attrSet('href', '#');
  }
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

markdownRenderer.renderer.rules.table_open = () => '<div class="markdown-table-wrap"><table>';
markdownRenderer.renderer.rules.table_close = () => '</table></div>';

const defaultImage = markdownRenderer.renderer.rules.image || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
markdownRenderer.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet('src') || '';
  if (!isSafeMarkdownUrl(src)) {
    token.attrSet('src', '');
  }
  token.attrSet('loading', 'lazy');
  token.attrSet('decoding', 'async');
  return defaultImage(tokens, idx, options, env, self);
};

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
      const text = normalizeMarkdownUnderline(value).replace(/\r\n/g, '\n').trim();
      if (!text) return '';
      return markdownRenderer.render(text).trim();
    },
    maskKey(key) {
      const value = String(key || '').trim();
      if (!value) return '未填写';
      if (value.length <= 8) return `${value.slice(0, 2)}***`;
      return `${value.slice(0, 4)}…${value.slice(-4)}`;
    },
    readJson(key, fallback) {
      return parseJsonOr(localStorage.getItem(key), fallback);
    },
    writeJson(key, value) {
      try {
        setCloudBackedLocalStorageItem(key, JSON.stringify(value));
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
