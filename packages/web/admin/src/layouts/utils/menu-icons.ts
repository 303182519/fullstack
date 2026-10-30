import type { MenuIconRegistry } from './menu-mapper';

import {
  ApartmentOutlined,
  BookOutlined,
  ControlOutlined,
  FileOutlined,
  FileSearchOutlined,
  HomeOutlined,
  MailOutlined,
  MonitorOutlined,
  NotificationOutlined,
  ScheduleOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { createElement } from 'react';

/**
 * 默认菜单图标注册表：后端 `sys_menu.icon` 字符串 → antd 图标。
 *
 * 必须显式登记、静态引用（Rspack 无法分析动态拼接的 import 路径）。
 * 新增菜单图标时在此追加一行；app 侧需要定制时自行组装 registry 传给 `toAdminMenuTree`。
 *
 * 当前键集合与种子菜单（`packages/node/database/src/seed.ts` 的 MENU_TREE）对齐，
 * 另含后台常见类目，键名以后端数据配置为准。
 */
export const defaultMenuIconRegistry: MenuIconRegistry = {
  config: createElement(ControlOutlined),
  dept: createElement(ApartmentOutlined),
  dict: createElement(BookOutlined),
  file: createElement(FileOutlined),
  home: createElement(HomeOutlined),
  job: createElement(ScheduleOutlined),
  log: createElement(FileSearchOutlined),
  message: createElement(MailOutlined),
  monitor: createElement(MonitorOutlined),
  notice: createElement(NotificationOutlined),
  role: createElement(TeamOutlined),
  settings: createElement(SettingOutlined),
  user: createElement(UserOutlined),
};
