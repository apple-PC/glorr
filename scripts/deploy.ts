// glorr 部署:构建 Pages → 经 GitHub Git Data API 提交(绕过 github.com 本体不可达/502)
// token 优先级:环境变量 PAT > 项目根目录 .pat 文件(已被 .gitignore 忽略,切勿提交)
// 说明:本机直连 github.com 超时,且 git 走透明代理对 github.com 隧道 502;
//       但 curl 走代理访问 api.github.com 可用,故用 Git Data API 提交。
// 用法:npm run deploy   (会先 npm run build:pages)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO = 'apple-PC/glorr';
const BRANCH = 'main';
const API = 'https://api.github.com';

// 取 token
let token = process.env.PAT ?? '';
if (!token && fs.existsSync(path.resolve('.pat'))) token = fs.readFileSync(path.resolve('.pat'), 'utf-8').trim();
if (!token) {
  console.error('缺少 GitHub PAT。请二选一:\n  1) 环境变量:export PAT=ghp_xxx\n  2) 在项目根目录建 .pat 文件写入 token(已 gitignore)\n(从 https://github.com/settings/tokens 生成,需 repo 权限,作用域 apple-PC/glorr)');
  process.exit(1);
}

// ---------- 低层:curl 调 GitHub API(走系统代理,避免 git 隧道 502) ----------
function gh(method: string, apiPath: string, body?: unknown): Record<string, any> {
  const hdrPath = `/tmp/glorr_gh_${process.pid}_${Date.now()}.hdr`;
  fs.writeFileSync(hdrPath, `Authorization: Bearer ${token}\nAccept: application/vnd.github+json\nContent-Type: application/json\n`);
  const args = ['-sS', '-w', '\n__HTTP__%{http_code}', '-X', method, '-H', `@${hdrPath}`, `${API}${apiPath}`];
  if (body !== undefined) args.push('-d', JSON.stringify(body));
  const r = spawnSync('curl', args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  fs.rmSync(hdrPath, { force: true });
  if (r.error || r.status !== 0) throw new Error(`curl ${method} ${apiPath} 失败: ${r.stderr || r.error?.message}`);
  const out = r.stdout;
  const idx = out.lastIndexOf('\n__HTTP__');
  const code = Number(out.slice(idx + 9));
  const raw = out.slice(0, idx).trim();
  const data = raw ? JSON.parse(raw) : {};
  if (code >= 400) throw new Error(`${method} ${apiPath} -> ${code}: ${(raw || '').slice(0, 400)}`);
  return data;
}

// ---------- 收集要部署的文件 ----------
function collectFiles(): string[] {
  const roots = ['src', 'docs', 'scripts'];
  const rootFiles = [
    'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
    '.gitignore', 'README.md', 'Dockerfile', 'docker-compose.yml',
    'fly.toml', 'render.yaml', 'context.md', '.dockerignore',
  ];
  const skip = (p: string) => /(^|\/)(node_modules|\.git|\.workbuddy)(\/|$)/.test(p) || /\.pat$/.test(p) || /\.log$/.test(p) || /(^|\/)dist(\/|$)/.test(p);
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (skip(p)) continue;
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  for (const r of roots) if (fs.existsSync(r)) walk(r);
  for (const f of rootFiles) if (fs.existsSync(f) && !skip(f)) out.push(f);
  return out;
}

// ---------- 主流程 ----------
function main(): void {
  // 0. 构建 Pages(产物到 docs/)
  console.log('[deploy] 构建 Pages...');
  const build = spawnSync('npm', ['run', 'build:pages'], { stdio: 'inherit' });
  if (build.status !== 0) { console.error('[deploy] 构建失败'); process.exit(1); }
  // Pages 关闭 Jekyll
  fs.writeFileSync(path.resolve('docs/.nojekyll'), '');

  // 1. 校验 token + 代理连通
  const who = gh('GET', '/user');
  console.log(`[deploy] 已认证:${who.login}  仓库:${REPO}`);

  // 2. 文件清单
  const files = collectFiles();
  console.log(`[deploy] 待提交 ${files.length} 个文件`);

  // 3. 建 blob
  const tree: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const f of files) {
    const b64 = fs.readFileSync(f).toString('base64');
    const blob = gh('POST', `/repos/${REPO}/git/blobs`, { content: b64, encoding: 'base64' }) as { sha: string };
    tree.push({ path: f, mode: '100644', type: 'blob', sha: blob.sha });
  }
  console.log(`[deploy] 已创建 ${tree.length} 个 blob`);

  // 4. 建 tree(完整镜像本地,不依赖 base_tree)
  const newTree = gh('POST', `/repos/${REPO}/git/trees`, { tree }) as { sha: string };

  // 5. 远端最新 commit 作为 parent(fast-forward,不丢历史)
  const ref = gh('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`) as { object: { sha: string } };
  const baseSha = ref.object.sha;

  // 6. 建 commit
  const message = process.env.DEPLOY_MSG || `deploy: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
  const commit = gh('POST', `/repos/${REPO}/git/commits`, { message, tree: newTree.sha, parents: [baseSha] }) as { sha: string };

  // 7. 更新分支引用(基于远端最新,fast-forward)
  gh('PATCH', `/repos/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false });
  console.log(`[deploy] 推送完成 ✅  commit ${commit.sha.slice(0, 7)}  GitHub Pages 通常 1 分钟内生效`);
  console.log(`[deploy] 线上地址: https://${REPO.split('/')[0]}.github.io/${REPO.split('/')[1]}/`);
}

try {
  main();
} catch (err) {
  console.error('[deploy] 失败:', err instanceof Error ? err.message : err);
  process.exit(1);
}
