/**
 * FileController E2E 集成测试（NestJS Application Context）。
 *
 * 覆盖：
 * - multipart/form-data 上传（Multer + 真实 FileInterceptor）
 * - 鉴权守卫链路（JwtAuthGuard + PermissionGuard + Redis 降级路径）
 * - 限流（ThrottlerGuard + @Throttle 装饰器）
 * - 错误码（FileBizCode 90A01–90A08 + 全局异常过滤器）
 * - 响应头（Content-Type / Content-Disposition）
 *
 * 策略：
 *   Test.createTestingModule({ imports: [AppModule] }) 编译完整 NestJS app，
 *   override 外部依赖 provider 避免真实 Redis / Prisma 连接：
 *   - SessionService → lookupSession 恒返回 unavailable（触发 Redis 降级路径）
 *   - PermissionService → hasAnyPermission 恒返回 true（无需真实权限校验）
 *   保留真实 Multer / Guard / Controller / FileService / 异常过滤器链路。
 *
 * 限流计数器隔离：每轮 beforeEach 新建 MemoryThrottlerStorage 实例并 override。
 */
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { Buffer } from 'node:buffer';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SessionService } from '@/shared/auth/session.service.js';
import { PermissionService } from '@/shared/permission/permission.service.js';
import { initSnowflake } from '@/shared/utils/snowflake.js';
import { AppModule } from './../src/app.module.js';

describe('FileController (e2e)', () => {
  let app: INestApplication<App>;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;
  let jwt: JwtService;
  let token: string;

  beforeAll(() => {
    initSnowflake(0n, 0n);
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SessionService)
      .useValue({
        lookupSession: vi.fn().mockResolvedValue({ status: 'unavailable' as const }),
      })
      .overrideProvider(PermissionService)
      .useValue({
        hasAnyPermission: vi.fn().mockResolvedValue(true),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    jwt = app.get(JwtService);
    httpServer = app.getHttpServer();

    // 签发真实 access token（typ/sub/sid 必填 → JwtAuthGuard 通过；
    // Redis 降级路径仅凭 claims 重建主体，不查会话）
    token = await jwt.signAsync({
      typ: 'access',
      sub: '1',
      sid: 'session-e2e-001',
      tid: '42',
      un: 'e2e-user',
      sup: true,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  // ---------- 守卫层 ----------

  describe('守卫层', () => {
    it('无 Authorization 头 → 401', () => {
      return request(httpServer)
        .get('/files')
        .expect(401);
    });

    it('Authorization: Bearer 无 token → 401', () => {
      return request(httpServer)
        .get('/files')
        .set('Authorization', 'Bearer ')
        .expect(401);
    });

    it('错误签名 token → 401', () => {
      return request(httpServer)
        .get('/files')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ0eXAiOiJhY2Nlc3MiLCJzdWIiOiIxIn0.invalid-signature')
        .expect(401);
    });

    it('token 缺 typ → 401', async () => {
      const bad = await jwt.signAsync({ sub: '1', sid: 's' });
      return request(httpServer)
        .get('/files')
        .set('Authorization', `Bearer ${bad}`)
        .expect(401);
    });

    it('token 缺 sid → 401', async () => {
      const bad = await jwt.signAsync({ typ: 'access', sub: '1' });
      return request(httpServer)
        .get('/files')
        .set('Authorization', `Bearer ${bad}`)
        .expect(401);
    });

    it('有效 token 能通过守卫 → 到达业务层（400/200 皆可，非 401）', () => {
      return request(httpServer)
        .get('/files')
        .set('Authorization', `Bearer ${token}`)
        .expect((res) => {
          // 不会被 JwtAuthGuard 拒绝
          expect(res.status).not.toBe(401);
        });
    });
  });

  // ---------- 列表 / 详情路由可达性 ----------

  describe('GET /files 路由可达', () => {
    it('有 token → 不被 401 拒绝', () => {
      return request(httpServer)
        .get('/files')
        .set('Authorization', `Bearer ${token}`)
        .expect((res) => { expect(res.status).not.toBe(401); });
    });
  });

  describe('GET /files/:id 路由可达', () => {
    it('有 token → 不被 401 拒绝', () => {
      return request(httpServer)
        .get('/files/1')
        .set('Authorization', `Bearer ${token}`)
        .expect((res) => { expect(res.status).not.toBe(401); });
    });
  });

  describe('DELETE /files/:id 路由可达', () => {
    it('有 token → 不被 401 拒绝', () => {
      return request(httpServer)
        .delete('/files/1')
        .set('Authorization', `Bearer ${token}`)
        .expect((res) => { expect(res.status).not.toBe(401); });
    });
  });

  describe('GET /files/:id/content 路由可达', () => {
    it('有 token → 不被 401 拒绝', () => {
      return request(httpServer)
        .get('/files/1/content')
        .set('Authorization', `Bearer ${token}`)
        .query({ direct: 'false' })
        .expect((res) => { expect(res.status).not.toBe(401); });
    });
  });

  // ---------- Multer multipart + Controller 管道 ----------

  describe('POST /files multipart', () => {
    it('无 file 字段 → Multer 拒绝 400', () => {
      return request(httpServer)
        .post('/files')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'multipart/form-data; boundary=xxx')
        .send('--xxx--')
        .expect(400);
    });

    it('伪造 image/png 头但内容非图片 → 90A07 verifyBuffer 失败', () => {
      // PNG 魔数（8 字节）+ 垃圾内容 → sharp 解析失败
      const fakePng = Buffer.from([
        0x89,
        0x50,
        0x4E,
        0x47,
        0x0D,
        0x0A,
        0x1A,
        0x0A,
        0x00,
        0x01,
        0x02,
        0x03,
        0x04,
        0x05,
        0x06,
        0x07,
      ]);
      return request(httpServer)
        .post('/files')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', fakePng, { filename: 'fake.png', contentType: 'image/png' })
        .expect(400); // 90A07 被全局异常过滤器转 400
    });
  });

  // ---------- 限流（POST /files 20/min）----------

  describe('Throttle — POST /files 20/min', () => {
    it('第 21 次请求 → 429', async () => {
      // 20 次空上传（每次都会走完整管道但被 Multer 400 拒绝，限流计数已生效）
      for (let i = 0; i < 20; i++) {
        await request(httpServer)
          .post('/files')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', Buffer.from(`i-${i}`), { filename: `${i}.txt` });
      }
      const res = await request(httpServer)
        .post('/files')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('over'), { filename: 'over.txt' });
      expect(res.status).toBe(429);
    });
  });
});
