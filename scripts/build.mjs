import {build} from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import ts from 'typescript';
import path from 'node:path';
const root=process.cwd();
for(const name of ['data','screen','test-login']){
 const source=await fs.readFile(path.join(root,'server/routes',name+'.ts'),'utf8');
 const result=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
 const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 if(errors.length)throw Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>root,getCanonicalFileName:x=>x,getNewLine:()=>"\n"}));
 await fs.writeFile(path.join(root,'server/routes',name+'.mjs'),result.outputText);
}
await build({configFile:false,root:path.join(root,'web'),plugins:[react()],build:{outDir:path.join(root,'dist/web'),emptyOutDir:true}});
