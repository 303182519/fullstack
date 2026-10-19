import type { PermissionCode } from '@fedstack/auth-core';
import { SetMetadata } from '@nestjs/common';

/**
 * 功能权限元数据 key：由全局 PermissionGuard 读取。
 */
export const REQUIRE_PERMISSION_KEY = 'require_permission';

/**
 * 声明端点所需的功能权限编码（menu.perm_code），如
 * `@RequirePermission(PERMISSIONS.SYSTEM.DEPT.QUERY)`。
 *
 * 语义（见 ADR-008 D1/D3）：
 * - 传入多个编码时为「任一满足即通过」（ANY）：同一操作若可由多条路径授权，写多个码即可；
 * - 未标注本装饰器的端点不做功能权限校验（仍受 JwtAuthGuard 的登录校验约束）；
 * - 平台超级管理员（isSuper）不受功能权限约束。
 *
 * 入参类型收窄为 `PermissionCode`（`@fedstack/auth-core` 注册表中登记的字面量联合）：
 * 未登记/拼错的权限码是编译错误，不会拖到运行期才发现。
 *
 * 注意：perm_code 与端点的映射关系靠本装饰器显式声明，代码即文档；新增受控端点必须标注。
 */
export function RequirePermission(...codes: PermissionCode[]) {
  return SetMetadata(REQUIRE_PERMISSION_KEY, codes);
}
