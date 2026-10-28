import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const retired=[
 'src/legacy/features/business-pages','src/legacy/features/business-pages.ts','src/legacy/features/agent-runtime',
 'src/legacy/features/project-skills.ts','src/legacy/features/data-recognition.ts','src/legacy/features/image-cutout.ts',
 'src/legacy/features/apimart-media.ts','src/legacy/features/ai-call-analysis.ts','src/components/reactbits',
];
const errors=[];
for(const file of retired)if(await stat(path.join(root,file)).then(()=>true,()=>false))errors.push(`Retired source remains: ${file}`);
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else if(/\.(ts|tsx)$/.test(e.name)&&!e.name.includes('.test.'))out.push(p);}return out;}
for(const file of await walk(path.join(root,'src'))){const source=await readFile(file,'utf8');if(/(?:from\s*|import\s*\()\s*['"][^'"]*(?:\/agent-runtime\/|\/business-pages(?:\/|['"])|\/features\/(?:project-skills|data-recognition|image-cutout|apimart-media|ai-call-analysis))/.test(source))errors.push(`Retired import in ${path.relative(root,file)}`);}
const loader=await readFile(path.join(root,'src/legacy/bootstrap/feature-loader.ts'),'utf8');
for(const page of ['property-analysis','spectrum-analysis','inspection-reports','ai-analysis','office-records','ai-config','theme-settings'])if(!loader.includes(`'${page}':`))errors.push(`Missing current page: ${page}`);
for (const name of ['property-analysis', 'spectrum-analysis', 'config']) {
  const source = await readFile(path.join(root, `src/legacy/features/${name}.ts`), 'utf8');
  if (/App\.(?:businessPages|projectSkills|aiCallAnalysis)|\b(?:getAgentContext|searchByAgent|createByAgent|updateByAgent|selectByAgent|deleteByAgent|tagByAgent|categorizeByAgent|syncAgentModelSelects|getAgentModelRefs)\b/.test(source)) errors.push(`Retired browser Agent hooks remain: ${name}`);
}
const api=await readFile(path.join(root,'worker/index.ts'),'utf8');
for(const handler of ['handleDataRecognitionHistory','handleUsers','handleLiblibAiProxy','mergeAiCallLogs','LEGACY_PROPERTY_DATA_URL'])if(api.includes(handler))errors.push(`Retired server handler remains: ${handler}`);
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log('Current scope check passed: seven pages, no retired ERP/browser-agent runtimes.');
