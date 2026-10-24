import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean));
const failures = [];
for (const file of files) {
  if (/(^|\/)(node_modules|build|release|artifacts|\.gradle)\//.test(file) || /\.(exe|dll|dmg|ico|icns|AppImage|deb|rpm|apk|aab|jar|zip|jks|keystore|p12|pfx|key)$/i.test(file) || /(?:^|\/)(?:\.env(?:\..*)?|keystore\.properties|credentials\..*)$/.test(file)) {
    failures.push(file);
    continue;
  }
  const target = new URL('../' + file, import.meta.url);
  try {
    if (statSync(target).isFile() && readFileSync(target).includes(0)) failures.push(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
if (failures.length) {
  console.error(`Git 文件列表包含构建产物、二进制或密钥：\n${failures.join('\n')}`);
  process.exitCode = 1;
} else console.log(`Git 检查通过：${files.size} 个源码/配置文件，无二进制产物或密钥。`);
