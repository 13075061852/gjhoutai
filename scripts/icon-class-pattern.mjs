const ICON_CLASS_PATTERN = /(?:^|[^a-z0-9-])(ti-[a-z0-9-]+)/g;

export function findIconClasses(content) {
  return [...content.matchAll(ICON_CLASS_PATTERN)].map((match) => match[1]);
}
