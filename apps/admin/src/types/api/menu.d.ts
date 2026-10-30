/**
 * admin-api `GET /menus/available` 的响应节点镜像。
 *
 * 契约真源：`apps/admin-api/src/modules/menu/dto/menu-response.dto.ts`。
 * 前端镜像只描述传输形状，不耦合 Prisma 模型；
 * 映射到菜单 UI 模型时由壳包 `layouts/utils/menu-mapper.ts` 的 `MenuDto` 做结构化收窄。
 */
export interface MenuResponseDto {
  /** 子菜单（后端始终返回数组，可能为空） */
  children: MenuResponseDto[];
  /** 前端组件路径（阶段 3 不使用；A 方案下无路径语义约定） */
  component: null | string;
  /** 创建时间（ISO 8601） */
  createdAt: string;
  /** 图标字符串（前端注册表映射为图标组件） */
  icon: null | string;
  /** 菜单 ID（雪花字符串） */
  id: string;
  /** 菜单名称 */
  menuName: string;
  /** 菜单类型 */
  menuType: 'BUTTON' | 'DIRECTORY' | 'MENU';
  /** 父菜单 ID（null=根节点） */
  parentId: null | string;
  /** 权限编码（按钮级权限主体，阶段 5 使用） */
  permCode: null | string;
  /** 前端路由 name */
  routeName: null | string;
  /** 前端路由 path（与文件路由路径字符串匹配） */
  routePath: null | string;
  /** 同级排序值 */
  sort: number;
  /** 菜单状态 */
  status: 'ACTIVE' | 'DISABLED';
  /** 是否可见 */
  visible: boolean;
}
