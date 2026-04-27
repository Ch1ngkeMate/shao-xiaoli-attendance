-- AlterTable
ALTER TABLE `Task` ADD COLUMN `stallNotifiedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Task_stallNotifiedAt_idx` ON `Task`(`stallNotifiedAt`);
