-- CreateTable
CREATE TABLE `sys_message_template` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `tenant_id` BIGINT NULL,
    `template_key` VARCHAR(100) NOT NULL,
    `channel` ENUM('inner', 'email', 'sms') NOT NULL,
    `subject` VARCHAR(200) NULL,
    `content` TEXT NOT NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',

    INDEX `sys_message_template_template_key_idx`(`template_key`),
    UNIQUE INDEX `sys_message_template_tenant_id_template_key_channel_key`(`tenant_id`, `template_key`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_message_send_log` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` BIGINT NOT NULL,
    `template_key` VARCHAR(100) NULL,
    `channel` ENUM('inner', 'email', 'sms') NOT NULL,
    `recipient` VARCHAR(255) NOT NULL,
    `subject` VARCHAR(200) NULL,
    `content` TEXT NOT NULL,
    `status` ENUM('success', 'failure') NOT NULL,
    `error_msg` VARCHAR(2000) NULL,
    `sent_at` DATETIME(3) NULL,

    INDEX `sys_message_send_log_tenant_id_created_at_idx`(`tenant_id`, `created_at`),
    INDEX `sys_message_send_log_channel_status_idx`(`channel`, `status`),
    INDEX `sys_message_send_log_template_key_idx`(`template_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_user_mfa` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `user_id` BIGINT NOT NULL,
    `tenant_id` BIGINT NOT NULL,
    `secret_cipher` VARCHAR(500) NOT NULL,
    `recovery_codes` JSON NOT NULL,
    `enabled_at` DATETIME(3) NULL,

    UNIQUE INDEX `sys_user_mfa_user_id_key`(`user_id`),
    INDEX `sys_user_mfa_tenant_id_idx`(`tenant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
