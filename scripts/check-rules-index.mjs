// 校验根 AGENTS.md 的规范路由索引：
// 1. 索引中引用的每个规范文件都必须存在（防死链）；
// 2. docs/rules/ 下的每个规范文件都必须被索引引用（防孤儿规范）；
// 3. 规范文档中写出的 skill 名必须在 .agents/skills/ 下真实存在（防指向已卸载 / 改名的 skill）。
// 零依赖，仅使用 node: 内置模块。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const indexPath = join(root, 'AGENTS.md');
const rulesRoot = join(root, 'docs', 'rules');
const skillsRoot = join(root, '.agents', 'skills');

const indexText = readFileSync(indexPath, 'utf8');

const referenced = new Set();
for (const match of indexText.matchAll(/docs\/rules\/[\w\-./]+\.md/g)) {
  referenced.add(match[0]);
}

const problems = [];

if (referenced.size === 0) {
  problems.push('AGENTS.md 中未找到任何 docs/rules/*.md 索引条目');
}

for (const rel of [...referenced].sort()) {
  if (!existsSync(join(root, rel))) {
    problems.push(`索引指向的文件不存在（死链）：${rel}`);
  }
}

function collectMarkdown(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectMarkdown(full));
    } else if (entry.endsWith('.md')) {
      files.push(relative(root, full).split(sep).join('/'));
    }
  }
  return files;
}

if (existsSync(rulesRoot)) {
  for (const rel of collectMarkdown(rulesRoot).sort()) {
    if (!referenced.has(rel)) {
      problems.push(`docs/rules 下的文件未被索引引用（孤儿规范）：${rel}`);
    }
  }
}

// 3. 规范文档中写出的 skill 名必须真实存在。
// 约定写法：skill `name` / skills `name`（大小写无关）。
const skillNames = new Set();
const scannedDocs = [
  indexPath,
  ...(existsSync(rulesRoot) ? collectMarkdown(rulesRoot).map((rel) => join(root, rel)) : []),
];
for (const file of scannedDocs) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/skills?\s+`([a-z0-9][a-z0-9-]*)`/gi)) {
    skillNames.add(match[1].toLowerCase());
  }
}

if (skillNames.size > 0 && !existsSync(skillsRoot)) {
  problems.push(`规范文档引用了 skill，但未找到安装目录：.agents/skills/`);
}

for (const name of [...skillNames].sort()) {
  if (existsSync(skillsRoot) && !existsSync(join(skillsRoot, name, 'SKILL.md'))) {
    problems.push(`文档引用的 skill 不存在：${name}（期望 .agents/skills/${name}/SKILL.md）`);
  }
}

if (problems.length > 0) {
  console.error('docs:check 失败：');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  `docs:check 通过：索引 ${referenced.size} 个规范文件（无死链、无孤儿），校验 ${skillNames.size} 个 skill 名。`,
);
