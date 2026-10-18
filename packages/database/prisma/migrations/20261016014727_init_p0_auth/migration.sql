-- CreateTable
CREATE TABLE `sys_tenant` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `tenant_code` VARCHAR(50) NOT NULL,
    `tenant_name` VARCHAR(100) NOT NULL,
    `domain` VARCHAR(255) NULL,
    `logo` VARCHAR(500) NULL,
    `contact_name` VARCHAR(50) NULL,
    `contact_phone` VARCHAR(20) NULL,
    `status` ENUM('active', 'disabled', 'expired') NOT NULL DEFAULT 'active',
    `expire_time` DATETIME(3) NULL,
    `package_id` BIGINT NULL,
    `user_limit` INTEGER NOT NULL DEFAULT 100,
    `storage_limit` BIGINT NOT NULL DEFAULT 1073741824,

    UNIQUE INDEX `sys_tenant_tenant_code_key`(`tenant_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_user` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `tenant_id` BIGINT NOT NULL,
    `username` VARCHAR(100) NOT NULL,
    `password` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(20) NULL,
    `nickname` VARCHAR(50) NULL,
    `avatar` VARCHAR(500) NULL,
    `gender` ENUM('male', 'female', 'unknown') NULL,
    `remark` VARCHAR(500) NULL,
    `status` ENUM('active', 'disabled', 'locked') NOT NULL DEFAULT 'active',
    `is_super` BOOLEAN NOT NULL DEFAULT false,
    `password_history` JSON NULL,

    UNIQUE INDEX `sys_user_tenant_id_username_key`(`tenant_id`, `username`),
    UNIQUE INDEX `sys_user_tenant_id_email_key`(`tenant_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `tenant_id` BIGINT NOT NULL,
    `role_name` VARCHAR(50) NOT NULL,
    `role_code` VARCHAR(50) NOT NULL,
    `description` VARCHAR(200) NULL,
    `data_scope` ENUM('all', 'dept_and_child') NOT NULL DEFAULT 'dept_and_child',
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `is_system` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `sys_role_tenant_id_role_code_key`(`tenant_id`, `role_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_user_role` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `user_id` BIGINT NOT NULL,
    `role_id` BIGINT NOT NULL,

    UNIQUE INDEX `sys_user_role_user_id_role_id_key`(`user_id`, `role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sys_user` ADD CONSTRAINT `sys_user_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role` ADD CONSTRAINT `sys_role_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_user_role` ADD CONSTRAINT `sys_user_role_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_user_role` ADD CONSTRAINT `sys_user_role_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
