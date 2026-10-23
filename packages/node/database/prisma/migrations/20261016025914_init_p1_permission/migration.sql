-- AlterTable
ALTER TABLE `sys_user` ADD COLUMN `dept_id` BIGINT NULL;

-- CreateTable
CREATE TABLE `sys_menu` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `tenant_id` BIGINT NULL,
    `parent_id` BIGINT NULL,
    `menu_type` ENUM('directory', 'menu', 'button') NOT NULL,
    `menu_name` VARCHAR(50) NOT NULL,
    `route_name` VARCHAR(100) NULL,
    `route_path` VARCHAR(200) NULL,
    `component` VARCHAR(200) NULL,
    `perm_code` VARCHAR(100) NULL,
    `icon` VARCHAR(100) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `visible` BOOLEAN NOT NULL DEFAULT true,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',

    INDEX `sys_menu_tenant_id_parent_id_idx`(`tenant_id`, `parent_id`),
    INDEX `sys_menu_perm_code_idx`(`perm_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_dept` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `tenant_id` BIGINT NOT NULL,
    `parent_id` BIGINT NULL,
    `dept_name` VARCHAR(50) NOT NULL,
    `leader` VARCHAR(50) NULL,
    `phone` VARCHAR(20) NULL,
    `path` VARCHAR(500) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',

    INDEX `sys_dept_tenant_id_parent_id_idx`(`tenant_id`, `parent_id`),
    INDEX `sys_dept_tenant_id_path_idx`(`tenant_id`, `path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role_menu` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `role_id` BIGINT NOT NULL,
    `menu_id` BIGINT NOT NULL,

    UNIQUE INDEX `sys_role_menu_role_id_menu_id_key`(`role_id`, `menu_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_tenant_package` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `package_name` VARCHAR(50) NOT NULL,
    `package_code` VARCHAR(50) NOT NULL,
    `description` VARCHAR(200) NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',

    UNIQUE INDEX `sys_tenant_package_package_code_key`(`package_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_tenant_package_menu` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `package_id` BIGINT NOT NULL,
    `menu_id` BIGINT NOT NULL,

    UNIQUE INDEX `sys_tenant_package_menu_package_id_menu_id_key`(`package_id`, `menu_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `sys_user_tenant_id_dept_id_idx` ON `sys_user`(`tenant_id`, `dept_id`);

-- AddForeignKey
ALTER TABLE `sys_tenant` ADD CONSTRAINT `sys_tenant_package_id_fkey` FOREIGN KEY (`package_id`) REFERENCES `sys_tenant_package`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_user` ADD CONSTRAINT `sys_user_dept_id_fkey` FOREIGN KEY (`dept_id`) REFERENCES `sys_dept`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_menu` ADD CONSTRAINT `sys_role_menu_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_menu` ADD CONSTRAINT `sys_role_menu_menu_id_fkey` FOREIGN KEY (`menu_id`) REFERENCES `sys_menu`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_tenant_package_menu` ADD CONSTRAINT `sys_tenant_package_menu_package_id_fkey` FOREIGN KEY (`package_id`) REFERENCES `sys_tenant_package`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_tenant_package_menu` ADD CONSTRAINT `sys_tenant_package_menu_menu_id_fkey` FOREIGN KEY (`menu_id`) REFERENCES `sys_menu`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
