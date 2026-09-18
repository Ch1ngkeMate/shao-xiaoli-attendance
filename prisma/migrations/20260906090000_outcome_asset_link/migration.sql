-- AlterTable: OutcomeAssetKind 增加 LINK（网盘等外链材料，大文件不入库）
ALTER TABLE `taskoutcomeasset` MODIFY `kind` ENUM('IMAGE', 'VIDEO', 'DOCUMENT', 'LINK') NOT NULL;
