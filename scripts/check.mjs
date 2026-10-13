import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const directory=fileURLToPath(new URL('../dist/',import.meta.url));
const files=readdirSync(directory).filter(name=>name.endsWith('.js'));
for(const file of files){
  const result=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../dist/'+file,import.meta.url))],{stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
console.log(`已检查 ${files.length} 个 JavaScript 模块。`);
