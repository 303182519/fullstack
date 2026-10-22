-- CreateTable
CREATE TABLE `sys_job_run` (
    `id` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenant_id` BIGINT NULL,
    `name` VARCHAR(128) NOT NULL,
    `queue_name` VARCHAR(64) NOT NULL DEFAULT 'default',
    `bull_job_id` VARCHAR(128) NULL,
    `trigger_type` ENUM('manual', 'cron', 'system') NOT NULL DEFAULT 'manual',
    `status` ENUM('queued', 'active', 'completed', 'failed', 'delayed', 'cancelled') NOT NULL DEFAULT 'queued',
    `progress` INTEGER NOT NULL DEFAULT 0,
    `payload` JSON NULL,
    `result` JSON NULL,
    `error_message` VARCHAR(2000) NULL,
    `attempts_made` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 1,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_by` BIGINT NULL,

    INDEX `sys_job_run_tenant_id_status_created_at_idx`(`tenant_id`, `status`, `created_at`),
    INDEX `sys_job_run_name_created_at_idx`(`name`, `created_at`),
    INDEX `sys_job_run_bull_job_id_idx`(`bull_job_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
