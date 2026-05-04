import { legacyMarkup } from '../legacy/legacyMarkup';

export function LegacyShell() {
  return <div dangerouslySetInnerHTML={{ __html: legacyMarkup }} />;
}
