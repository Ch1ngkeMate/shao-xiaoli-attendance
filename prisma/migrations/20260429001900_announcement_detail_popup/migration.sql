-- 手工迁移：公告详情/图片/弹窗与已读统计
-- 说明：由于本地无法连接到实际 MySQL（WSL/Docker），此迁移由代码生成并需在部署机执行：
--   DATABASE_URL=... npx prisma migrate deploy
--   npx prisma generate

-- 1) 公告主体
CREATE TABLE IF NOT EXISTS `Announcement` (
  `id` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `body` LONGTEXT NOT NULL,
  `popupEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `popupDays` INT NOT NULL DEFAULT 0,
  `createdById` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `Announcement_createdAt_idx` (`createdAt`),
  INDEX `Announcement_popupEnabled_createdAt_idx` (`popupEnabled`, `createdAt`),
  CONSTRAINT `Announcement_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2) 公告图片
CREATE TABLE IF NOT EXISTS `AnnouncementImage` (
  `id` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `announcementId` VARCHAR(191) NOT NULL,
  `url` VARCHAR(191) NOT NULL,
  `sort` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  INDEX `AnnouncementImage_announcementId_sort_idx` (`announcementId`, `sort`),
  CONSTRAINT `AnnouncementImage_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `Announcement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3) 弹窗幂等：某用户某天是否已弹过某公告
CREATE TABLE IF NOT EXISTS `AnnouncementPopupShown` (
  `id` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `announcementId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `day` VARCHAR(10) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AnnouncementPopupShown_announcementId_userId_day_key` (`announcementId`, `userId`, `day`),
  INDEX `AnnouncementPopupShown_userId_day_idx` (`userId`, `day`),
  CONSTRAINT `AnnouncementPopupShown_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `Announcement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AnnouncementPopupShown_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4) 站内信表补 announcementId（用于跳转/已读统计聚合）
ALTER TABLE `InAppMessage`
  ADD COLUMN IF NOT EXISTS `announcementId` VARCHAR(191) NULL;

CREATE INDEX IF NOT EXISTS `InAppMessage_announcementId_idx` ON `InAppMessage`(`announcementId`);

ALTER TABLE `InAppMessage`
  ADD CONSTRAINT `InAppMessage_announcementId_fkey`
  FOREIGN KEY (`announcementId`) REFERENCES `Announcement`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

