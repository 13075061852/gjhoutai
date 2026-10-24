/** Patch trusted rendered answer markup without restarting every paragraph/tool animation. */
const key = (node: Node): string => {
  if (!(node instanceof Element)) return node.nodeName;
  return `${node.tagName}:${node.getAttribute('data-turn') || node.getAttribute('data-disclosure') || node.getAttribute('data-ui-key') || node.classList[0] || ''}`;
};

function compatible(current: Node, next: Node): boolean {
  return current.nodeType === next.nodeType && key(current) === key(next);
}

function syncNode(current: Node, next: Node): void {
  if (current.nodeType === Node.TEXT_NODE) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  if (!(current instanceof Element) || !(next instanceof Element)) return;
  // SVG children and data attributes belong to the existing IconPark adapter.
  if (current.classList.contains('ti') && current.getAttribute('class') === next.getAttribute('class')) return;
  for (const attribute of [...current.attributes]) {
    if (attribute.name === 'open' && current.tagName === 'DETAILS') continue;
    if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of [...next.attributes]) {
    if (attribute.name === 'open' && current.tagName === 'DETAILS') continue;
    if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
  }
  syncChildren(current, next);
}

function syncChildren(parent: Element, next: Element): void {
  let cursor = parent.firstChild;
  for (const desired of [...next.childNodes]) {
    if (!cursor) {
      parent.appendChild(desired.cloneNode(true));
      continue;
    }
    if (compatible(cursor, desired)) {
      const current = cursor;
      cursor = cursor.nextSibling;
      syncNode(current, desired);
      continue;
    }
    const match = [...parent.childNodes].slice([...parent.childNodes].indexOf(cursor) + 1).find((node) => compatible(node, desired));
    if (match) {
      parent.insertBefore(match, cursor);
      syncNode(match, desired);
    } else {
      parent.insertBefore(desired.cloneNode(true), cursor);
    }
  }
  while (cursor) {
    const nextSibling = cursor.nextSibling;
    parent.removeChild(cursor);
    cursor = nextSibling;
  }
}

export function patchAiChildren(parent: Element, html: string): void {
  const template = document.createElement('div');
  template.innerHTML = html;
  syncChildren(parent, template);
}

export function patchAiTurn(current: HTMLElement, html: string): void {
  const template = document.createElement('div');
  template.innerHTML = html;
  const next = template.firstElementChild;
  if (next) syncNode(current, next);
}
