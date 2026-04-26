-- 允许同一用户接取同一任务的不同时间段：去掉 (taskId,userId) 唯一，改为 (taskId,userId,timeSlotId)

-- 接取记录若 timeSlotId 为空但任务有时段，回填到 sort 最小的一段
UPDATE `TaskClaim` AS c
INNER JOIN (
  SELECT t1.`taskId`, t1.`id`
  FROM `TaskTimeSlot` AS t1
  INNER JOIN (
    SELECT `taskId`, MIN(`sort`) AS mn FROM `TaskTimeSlot` GROUP BY `taskId`
  ) AS t2 ON t1.`taskId` = t2.`taskId` AND t1.`sort` = t2.mn
) AS first_slot ON first_slot.`taskId` = c.`taskId`
SET c.`timeSlotId` = first_slot.`id`
WHERE c.`timeSlotId` IS NULL;

ALTER TABLE `TaskClaim` DROP INDEX `TaskClaim_taskId_userId_key`;

CREATE UNIQUE INDEX `TaskClaim_taskId_userId_timeSlotId_key` ON `TaskClaim` (`taskId`, `userId`, `timeSlotId`);
