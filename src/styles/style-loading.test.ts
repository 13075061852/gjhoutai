import { describe, expect, it } from 'vitest';
// @ts-expect-error Tests run in Node, not the browser.
import { readFileSync } from 'node:fs';
import office from '../legacy/features/office-records/index.ts?raw';
import property from '../legacy/features/property-analysis.ts?raw';
import spectrum from '../legacy/features/spectrum-analysis.ts?raw';
import inspection from '../legacy/features/inspection-reports.ts?raw';
import ai from '../legacy/features/ai-analysis.ts?raw';
import theme from '../legacy/features/theme-settings.ts?raw';
import bootstrap from '../legacy/bootstrap.ts?raw';
import loader from '../legacy/bootstrap/feature-loader.ts?raw';
import main from '../main.tsx?raw';
const styles=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
describe('current page style loading',()=>{
  it('loads only current feature styles on demand',()=>{
    for(const [source,file] of [[office,'office-records-base.css'],[property,'property-analysis.css'],[spectrum,'spectrum-analysis.css'],[inspection,'inspection-reports.css'],[ai,'ai-analysis.css'],[theme,'theme-settings.css']]){
      expect(source).toContain(file);expect(styles).not.toContain(file);
    }
    expect(styles).toContain('config.css');
    expect(styles).toContain('office-records.css');
  });
  it('removes retired runtime/style imports rather than merely hiding their entries',()=>{
    for(const name of ['business-pages','data-recognition','image-cutout','project-skills','apimart-media','ai-call-analysis','agent-runtime','dashboard-page']){
      expect(loader).not.toContain(name);expect(bootstrap).not.toContain(`features/${name}`);
    }
    expect(bootstrap).not.toContain('App?.chat');
    expect(bootstrap).not.toContain("ensureLegacyPageFeature('ai-config')");
  });
  it('keeps responsive styles synchronous and theme overrides lazy',()=>{
    expect(main).toContain("import './styles/layout/responsive.css'");
    expect(bootstrap).toContain('theme-overrides.css');
    expect(bootstrap).toContain('installCurrentPagePermissions();');
  });
});
