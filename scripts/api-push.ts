// 通过 GitHub Git Data API 推送提交(github.com 本体不可达时的备用通道)
// 用法:PAT=ghp_xxx npx tsx scripts/api-push.ts <owner> <repo> <branch> <baseCommitSha>
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const PAT = process.env.PAT;
const [owner, repo, branch, baseSha] = process.argv.slice(2);
if (!PAT || !owner || !repo || !branch || !baseSha) {
  console.error('用法:PAT=ghp_xxx npx tsx scripts/api-push.ts <owner> <repo> <branch> <baseCommitSha>');
  process.exit(1);
}

const API = 'https://api.github.com';
const auth = {
  authorization: `Bearer ${PAT}`,
  accept: 'application/vnd.github+json',
  'content-type': 'application/json',
};

async function gh(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

async function main(): Promise<void> {
  // 1. 变更文件清单
  const diff = execSync(`git diff --name-status ${baseSha} HEAD`, { encoding: 'utf-8' })
    .split('\n')
    .filter(Boolean);
  const entries: { path: string; status: string }[] = diff.map((line) => {
    const [status, ...rest] = line.split('\t');
    return { path: rest[rest.length - 1], status: status[0] };
  });
  console.log(`变更 ${entries.length} 个文件`);

  // 2. 建 blob
  const tree: { path: string; mode: string; type: string; sha: string | null }[] = [];
  for (const entry of entries) {
    if (entry.status === 'D') {
      tree.push({ path: entry.path, mode: '100644', type: 'blob', sha: null });
      console.log(`  D ${entry.path}`);
      continue;
    }
    const content = fs.readFileSync(entry.path);
    const blob = (await gh(`/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' }),
    })) as { sha: string };
    tree.push({ path: entry.path, mode: '100644', type: 'blob', sha: blob.sha });
    console.log(`  ${entry.status} ${entry.path}`);
  }

  // 3. 基于线上最新 tree 建新 tree
  const ref = (await gh(`/repos/${owner}/${repo}/git/ref/heads/${branch}`)) as { object: { sha: string } };
  const headCommit = (await gh(`/repos/${owner}/${repo}/git/commits/${ref.object.sha}`)) as { tree: { sha: string } };
  const newTree = (await gh(`/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: headCommit.tree.sha, tree }),
  })) as { sha: string };

  // 4. 建提交并更新分支
  const message = execSync('git log -1 --pretty=%B', { encoding: 'utf-8' }).trim();
  const commit = (await gh(`/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }),
  })) as { sha: string };
  await gh(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  console.log(`\n推送成功:${commit.sha}`);
}

main().catch((err) => {
  console.error('推送失败:', err instanceof Error ? err.message : err);
  process.exit(1);
});
