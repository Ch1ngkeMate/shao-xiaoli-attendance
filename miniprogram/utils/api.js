/**
 * API 模块封装
 * 集中管理所有后端接口调用，统一错误处理和 token 管理
 */
const { request } = require("./request");

// ============ 认证 ============

/** 微信登录（已绑定） */
function wxLogin(code) {
  return request({ url: "/api/miniprogram/auth/wx-login", method: "POST", data: { code } });
}

/** 微信绑定并登录（首次） */
function bindLogin(code, realName) {
  return request({ url: "/api/miniprogram/auth/bind-login", method: "POST", data: { code, realName } });
}

// ============ 当前用户 ============

/** 获取当前用户信息 */
function getMe() {
  return request({ url: "/api/me" });
}

/** 更新个人信息 */
function updateMe(data) {
  return request({ url: "/api/me", method: "PATCH", data });
}

/** 我的月度考勤 */
function getMyAttendance(month) {
  return request({ url: "/api/me/attendance", data: { month } });
}

// ============ 任务 ============

/** 任务列表 */
function getTasks(params = {}) {
  return request({ url: "/api/tasks", data: params });
}

/** 创建任务 */
function createTask(data) {
  return request({ url: "/api/tasks", method: "POST", data });
}

/** 任务详情 */
function getTaskDetail(id) {
  return request({ url: `/api/tasks/${id}` });
}

/** 接取任务 */
function claimTask(taskId, timeSlotId) {
  return request({ url: `/api/tasks/${taskId}/claim`, method: "POST", data: { timeSlotId } });
}

/** 取消接取（管理员移除） — claimId 用于多时段，userId 用于单时段兼容 */
function removeClaim(taskId, userId, claimId) {
  const data = {};
  if (claimId) data.claimId = claimId;
  if (userId) data.userId = userId;
  return request({ url: `/api/tasks/${taskId}/remove-claim`, method: "POST", data });
}

/** 提交任务完成 */
function submitTask(taskId, data) {
  return request({ url: `/api/tasks/${taskId}/submit`, method: "POST", data });
}

/** 关单 */
function closeTask(taskId, excludeFromAttendance) {
  return request({ url: `/api/tasks/${taskId}/close`, method: "POST", data: { excludeFromAttendance } });
}

// ============ 审核 ============

/** 取任务提交审核列表 */
function getTaskSubmissions(taskId) {
  return request({ url: `/api/tasks/${taskId}/submissions` });
}

/** 审核提交 */
function reviewSubmission(submissionId, result, reason) {
  return request({
    url: `/api/submissions/${submissionId}/review`,
    method: "POST",
    data: { result, reason },
  });
}

// ============ 会议 ============

/** 会议列表 */
function getMeetings() {
  return request({ url: "/api/meetings" });
}

/** 发布会议 */
function createMeeting(data) {
  return request({ url: "/api/meetings", method: "POST", data });
}

/** 会议详情 */
function getMeetingDetail(id) {
  return request({ url: `/api/meetings/${id}` });
}

/** GPS 签到 */
function checkInMeeting(meetingId, lat, lng) {
  return request({ url: `/api/meetings/${meetingId}/check-in`, method: "POST", data: { lat, lng } });
}

/** 获取签到清单（管理员） */
function getCheckInList(meetingId) {
  return request({ url: `/api/meetings/${meetingId}/check-in` });
}

/** 结束会议（记旷会） */
function endMeeting(id, absentUserIds) {
  return request({ url: `/api/meetings/${id}`, method: "POST", data: { action: "end", absentUserIds } });
}

// ============ 值班 ============

/** 值班列表 */
function getDuty() {
  return request({ url: "/api/duty" });
}

/** 添加值班安排 */
function addDuty(weekday, period, userId, deptLabel) {
  return request({ url: "/api/duty", method: "POST", data: { weekday, period, userId, deptLabel: deptLabel || undefined } });
}

/** 移除值班安排 */
function removeDuty(id) {
  return request({ url: `/api/duty?id=${encodeURIComponent(id)}`, method: "DELETE" });
}

// ============ 请假 ============

/** 请假列表 */
function getLeaves() {
  return request({ url: "/api/leave" });
}

/** 提交请假 */
function applyLeave(data) {
  return request({ url: "/api/leave", method: "POST", data });
}

/** 审批请假 */
function decideLeave(leaveId, approve, rejectReason) {
  return request({ url: `/api/leave/${leaveId}/decide`, method: "POST", data: { approve, rejectReason } });
}

// ============ 公告 ============

/** 公告详情 */
function getAnnouncementDetail(id) {
  return request({ url: `/api/announcements/${id}` });
}

/** 发布公告 */
function createAnnouncement(data) {
  return request({ url: "/api/announcements", method: "POST", data });
}

// ============ 站内消息 ============

/** 消息列表 */
function getNotifications() {
  return request({ url: "/api/notifications" });
}

/** 标记已读 */
function markNotificationRead(id, markAll) {
  return request({ url: "/api/notifications", method: "PATCH", data: { id, markAll } });
}

/** 消息详情 */
function getNotificationDetail(id) {
  return request({ url: `/api/notifications/${id}` });
}

// ============ 报表 ============

/** 月报统计 */
function getMonthlyReport(month) {
  return request({ url: "/api/reports/monthly", data: { month } });
}

// ============ 考勤 ============

/** 考勤统计（MINISTER/ADMIN） */
function getAttendanceStats(month) {
  return request({ url: "/api/attendance", data: { month } });
}

// ============ 上传 ============

/** 上传文件 */
function uploadFile(filePath, type) {
  let url;
  switch (type) {
    case "avatar":
      url = "/api/upload/avatar";
      break;
    case "evidence":
      url = "/api/upload/evidence";
      break;
    case "task":
      url = "/api/upload";
      break;
    default:
      url = "/api/upload";
  }
  return new Promise((resolve, reject) => {
    const app = getApp();
    const { getApiBase } = require("./config");
    const base = getApiBase();
    wx.uploadFile({
      url: `${base}${url}`,
      filePath,
      name: "file",
      header: { Authorization: `Bearer ${app.globalData.token}` },
      success(res) {
        try {
          const data = JSON.parse(res.data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(data.message || "上传失败"));
          }
        } catch (e) {
          reject(new Error("解析上传结果失败"));
        }
      },
      fail(err) {
        reject(err);
      },
    });
  });
}

// ============ 用户 ============

/** 可指派用户列表 */
function getAssignableUsers() {
  return request({ url: "/api/users/assignable" });
}

/** 他人主页/考勤 */
function getUserProfile(userId, month) {
  return request({ url: `/api/admin/users/${userId}/profile`, data: { month } });
}

/** 版本号 */
function getVersion() {
  return request({ url: "/api/version" });
}

module.exports = {
  // 认证
  wxLogin, bindLogin,
  // 用户
  getMe, updateMe, getMyAttendance,
  // 任务
  getTasks, createTask, getTaskDetail, claimTask, removeClaim, submitTask, closeTask,
  // 审核
  reviewSubmission,
  getTaskSubmissions,
  // 会议
  getMeetings, createMeeting, getMeetingDetail, endMeeting, checkInMeeting, getCheckInList,
  // 值班
  getDuty, addDuty, removeDuty,
  // 请假
  getLeaves, applyLeave, decideLeave,
  // 公告
  getAnnouncementDetail, createAnnouncement,
  // 消息
  getNotifications, markNotificationRead, getNotificationDetail,
  // 报表
  getMonthlyReport,
  // 考勤
  getAttendanceStats,
  // 上传
  uploadFile,
  // 其他
  getAssignableUsers, getUserProfile, getVersion,
};
