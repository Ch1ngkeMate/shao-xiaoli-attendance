/**
 * 任务时间边界：优先用多段 timeSlots 汇总；无则回退到 Task 上汇总的起止
 */
export function getTaskTimeBoundsFromSlots(
  task: {
    startTime: Date;
    endTime: Date;
    timeSlots?: { startTime: Date; endTime: Date }[];
  },
): { start: Date; end: Date } {
  const slots = task.timeSlots;
  if (slots && slots.length > 0) {
    const starts = slots.map((s) => s.startTime.getTime());
    const ends = slots.map((s) => s.endTime.getTime());
    return {
      start: new Date(Math.min(...starts)),
      end: new Date(Math.max(...ends)),
    };
  }
  return { start: task.startTime, end: task.endTime };
}
