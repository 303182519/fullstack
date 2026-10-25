# @fedstack/tsconfig

fedstack 共享 TypeScript 配置包：三份 preset 覆盖仓库全部编译场景，各 app / package 通过包名继承，替代已删除的根 `tsconfig.base.json`（ADR-017）。

## Preset 职责

| Preset      | 在 base 之上增加                                 | 适用场景                                                         |
| ----------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| `base.json` | （最小公共集本身，环境无关）                     | 不直接消费，只作为 node / web 的共同父级                         |
| `node.json` | `nodenext` 模块解析、装饰器元数据、`declaration` | `apps/*`、`packages/node`、`packages/shared`、`packages/tooling` |
| `web.json`  | `bundler` 模块解析、DOM lib、`declaration`       | `packages/web`（rslib 构建的包）                                 |

## 选用决策

新包按三问选 preset：

1. 浏览器运行时（DOM、rslib 构建）→ `web.json`
2. Node 运行时（NestJS 应用、tsc 直建库、脚本工具）→ `node.json`
3. 看似两边都不靠 → 按最终运行环境归入其一；`base.json` 不被直接继承

## 使用

tsconfig.json：

```json
{
  "extends": "@fedstack/tsconfig/node.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"]
}
```

消费方 package.json 需声明 devDependency（extends 经 node_modules 符号链接解析）：

```json
{
  "devDependencies": {
    "@fedstack/tsconfig": "workspace:*"
  }
}
```

## 治理规则

- 环境无关的公共开关才进 `base.json`；环境语义（module / moduleResolution / lib / 装饰器 / declaration）留在对应 preset。
- 严格度开关（strict 家族）的任何调整需要 ADR 记录，不做顺手收紧。
- preset 集合保持三份；确需细分（如 node-lib / node-app）时先写 ADR 再新增。
