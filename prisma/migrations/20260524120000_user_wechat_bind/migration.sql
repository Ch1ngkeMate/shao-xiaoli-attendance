-- 微信小程序 openid / unionid 绑定

ALTER TABLE `User`
ADD COLUMN `wxOpenId` VARCHAR(191) NULL,
ADD COLUMN `wxUnionId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `User_wxOpenId_key` ON `User`(`wxOpenId`);
