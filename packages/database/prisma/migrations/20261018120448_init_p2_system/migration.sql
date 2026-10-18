-- CreateTable
CREATE TABLE `sys_dict_type` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `tenant_id` BIGINT NULL,
    `dict_name` VARCHAR(100) NOT NULL,
    `dict_type` VARCHAR(100) NOT NULL,
    `remark` VARCHAR(500) NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',

    INDEX `sys_dict_type_dict_type_idx`(`dict_type`),
    UNIQUE INDEX `sys_dict_type_tenant_id_dict_type_key`(`tenant_id`, `dict_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_dict_data` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `tenant_id` BIGINT NULL,
    `dict_type` VARCHAR(100) NOT NULL,
    `dict_label` VARCHAR(100) NOT NULL,
    `dict_value` VARCHAR(100) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `remark` VARCHAR(500) NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',

    INDEX `sys_dict_data_dict_type_idx`(`dict_type`),
    UNIQUE INDEX `sys_dict_data_tenant_id_dict_type_dict_value_key`(`tenant_id`, `dict_type`, `dict_value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_config` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `tenant_id` BIGINT NULL,
    `config_name` VARCHAR(100) NOT NULL,
    `config_key` VARCHAR(100) NOT NULL,
    `config_value` VARCHAR(500) NOT NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `remark` VARCHAR(500) NULL,

    UNIQUE INDEX `sys_config_tenant_id_config_key_key`(`tenant_id`, `config_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_oper_log` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `username` VARCHAR(100) NOT NULL,
    `module` VARCHAR(50) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `method` VARCHAR(10) NOT NULL,
    `path` VARCHAR(200) NOT NULL,
    `ip` VARCHAR(50) NULL,
    `params` JSON NULL,
    `result` JSON NULL,
    `status` ENUM('success', 'failure') NOT NULL,
    `error_msg` VARCHAR(2000) NULL,
    `cost_ms` INTEGER NOT NULL,

    INDEX `sys_oper_log_tenant_id_created_at_idx`(`tenant_id`, `created_at`),
    INDEX `sys_oper_log_created_at_idx`(`created_at`),
    INDEX `sys_oper_log_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_login_log` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` BIGINT NOT NULL,
    `user_id` BIGINT NULL,
    `username` VARCHAR(100) NOT NULL,
    `ip` VARCHAR(50) NULL,
    `device` VARCHAR(50) NULL,
    `status` ENUM('success', 'failure') NOT NULL,
    `msg` VARCHAR(100) NOT NULL,

    INDEX `sys_login_log_tenant_id_created_at_idx`(`tenant_id`, `created_at`),
    INDEX `sys_login_log_created_at_idx`(`created_at`),
    INDEX `sys_login_log_username_idx`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
