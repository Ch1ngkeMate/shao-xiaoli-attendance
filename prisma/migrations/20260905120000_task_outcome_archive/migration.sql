-- A task-level, public-facing archive. Existing task submissions remain private review evidence.
CREATE TABLE `TaskOutcome` (
  `id` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `taskId` VARCHAR(191) NOT NULL,
  `summary` TEXT NULL,
  `externalUrl` VARCHAR(191) NULL,
  `externalLabel` VARCHAR(191) NULL,
  `updatedById` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `TaskOutcome_taskId_key`(`taskId`),
  INDEX `TaskOutcome_updatedAt_idx`(`updatedAt`),
  INDEX `TaskOutcome_updatedById_idx`(`updatedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TaskOutcomeAsset` (
  `id` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `outcomeId` VARCHAR(191) NOT NULL,
  `kind` ENUM('IMAGE', 'VIDEO', 'DOCUMENT') NOT NULL,
  `url` VARCHAR(191) NOT NULL,
  `filename` VARCHAR(191) NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `sizeBytes` INTEGER NULL,
  `sort` INTEGER NOT NULL DEFAULT 0,
  `uploadedById` VARCHAR(191) NOT NULL,
  INDEX `TaskOutcomeAsset_outcomeId_sort_idx`(`outcomeId`, `sort`),
  INDEX `TaskOutcomeAsset_uploadedById_idx`(`uploadedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TaskOutcome` ADD CONSTRAINT `TaskOutcome_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TaskOutcome` ADD CONSTRAINT `TaskOutcome_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `TaskOutcomeAsset` ADD CONSTRAINT `TaskOutcomeAsset_outcomeId_fkey` FOREIGN KEY (`outcomeId`) REFERENCES `TaskOutcome`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TaskOutcomeAsset` ADD CONSTRAINT `TaskOutcomeAsset_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
