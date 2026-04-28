-- Add profile background url for cross-device sync

ALTER TABLE `User`
ADD COLUMN `profileBgUrl` VARCHAR(191) NULL;

