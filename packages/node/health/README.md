# @fedstack/health

企业级共享健康检查底座（ADR-004）：terminus 双探针骨架 + Redis 三态指标。

## 探针契约

| 路径                | 语义     | 依赖                      | 失败语义                                   |
| ------------------- | -------- | ------------------------- | ------------------------------------------ |
| `GET /health`       | 存活探针 | 无（进程级）              | 进程可用即 200                             |
| `GET /health/ready` | 就绪探针 | Redis（内置）+ app 装配项 | 任一 down → 503；degraded → 200 + degraded |

Redis 三态（口径收口在 `@fedstack/redis` 的 `CacheHealthIndicator`）：

- `up`：已配置且 PING 成功
- `degraded`：未配置 / 未注册 `RedisCacheModule`（内存降级，不就绪判死）
- `down`：已配置但不可达

## 消费方接线

```ts
// app.module.ts 的 imports 中：
import { HealthModule } from '@fedstack/health';
import { PrismaHealthIndicator } from '@nestjs/terminus';

const healthModule = HealthModule.forRootAsync({
  inject: [PrismaHealthIndicator, PrismaService],
  useFactory: (db: PrismaHealthIndicator, prisma: PrismaService) => ({
    readinessChecks: [
      // PrismaHealthIndicator 内部执行 SELECT 1，默认 1000ms 超时
      () => db.pingCheck('database', prisma),
    ],
  }),
});
```

```ts
// main.ts：探针不进入 /api 业务前缀（基础设施契约 ≠ 业务 API 契约）
app.setGlobalPrefix(server.apiPrefix, { exclude: ['health', 'health/ready'] });
```

前置条件：宿主已安装 `@nestjs/terminus`（peer）；就绪探针含 Redis 检查时，
宿主需注册 `RedisCacheModule`（`@fedstack/redis`，global），未注册则 cache 项 degraded。

## 网关 ACL：探针不对公网开放

探针路径不在 `/api` 前缀下，Nginx 需单独限制为内网探针网段：

```nginx
server {
    # 仅允许内网探针网段（k8s probe / 监控系统）
    location = /health {
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        deny all;
        proxy_pass http://app:3001;
    }

    location = /health/ready {
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        deny all;
        proxy_pass http://app:3001;
    }

    location /api/ {
        proxy_pass http://app:3001;
    }
}
```
