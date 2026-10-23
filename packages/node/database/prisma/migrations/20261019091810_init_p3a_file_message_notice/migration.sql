-- CreateTable
CREATE TABLE `sys_file` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `tenant_id` BIGINT NOT NULL,
    `uploader_id` BIGINT NOT NULL,
    `storage` ENUM('local', 's3') NOT NULL,
    `bucket` VARCHAR(100) NULL,
    `object_key` VARCHAR(500) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size` INTEGER NOT NULL,
    `module` VARCHAR(50) NULL,
    `cover_key` VARCHAR(500) NULL,
    `cover_format` VARCHAR(10) NULL,
    `cover_width` INTEGER NULL,
    `cover_height` INTEGER NULL,
    `cover_size` INTEGER NULL,

    INDEX `sys_file_tenant_id_created_at_idx`(`tenant_id`, `created_at`),
    INDEX `sys_file_tenant_id_deleted_at_idx`(`tenant_id`, `deleted_at`),
    INDEX `sys_file_uploader_id_idx`(`uploader_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_user_message` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `tenant_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` TEXT NOT NULL,
    `category` VARCHAR(50) NULL,
    `source_type` VARCHAR(50) NULL,
    `source_id` VARCHAR(80) NULL,
    `read_at` DATETIME(3) NULL,

    INDEX `sys_user_message_user_id_read_at_idx`(`user_id`, `read_at`),
    INDEX `sys_user_message_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_notice` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `tenant_id` BIGINT NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` TEXT NOT NULL,
    `type` ENUM('notice', 'bulletin') NOT NULL DEFAULT 'notice',
    `status` ENUM('draft', 'published', 'closed') NOT NULL DEFAULT 'draft',
    `publisher_id` BIGINT NULL,
    `publisher_name` VARCHAR(100) NULL,

    INDEX `sys_notice_tenant_id_status_created_at_idx`(`tenant_id`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
