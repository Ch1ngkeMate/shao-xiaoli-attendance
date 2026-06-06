/** 管理员「全员重置密码」时统一设置的初始密码，通过环境变量 ADMIN_RESET_PASSWORD 设置 */
export function getAdminResetPassword(): string {
  const pwd = process.env.ADMIN_RESET_PASSWORD;
  if (!pwd) {
    throw new Error("缺少环境变量 ADMIN_RESET_PASSWORD，请在 .env 或服务器环境变量中设置");
  }
  return pwd;
}
