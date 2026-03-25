/**
 * 依 user_type 限制可進入的路由（與側邊欄顯示）
 *
 * 1=系統開發者、2=課程管理者：全部頁面
 * 3=學生：僅測驗（/exam）、個人測驗分析（/main/analysis）、個資修改（/main/profile）
 */

export const RESTRICTED_USER_TYPE = 3;

/** 學生可進入的 view 參數（/main/:view）以及測驗對應的內部鍵 work */
export const STUDENT_ALLOWED_VIEWS = new Set(['work', 'analysis', 'profile']);

/**
 * @param {import('vue-router').RouteLocationNormalized} to
 * @returns {string | null} 權限判斷用的 view 鍵；非 Exam/Main 則 null
 */
export function routeViewKey(to) {
  if (to.name === 'Exam') return 'work';
  if (to.name === 'Main' && to.params.view) return String(to.params.view);
  return null;
}

/**
 * @param {{ user_type?: number | string } | null} user
 * @param {import('vue-router').RouteLocationNormalized} to
 */
export function userMayAccessRoute(user, to) {
  if (!user) return false;
  if (Number(user.user_type) !== RESTRICTED_USER_TYPE) return true;
  const key = routeViewKey(to);
  if (key == null) return true;
  return STUDENT_ALLOWED_VIEWS.has(key);
}

/**
 * 側邊欄單一連結是否顯示（與 route 權限一致）
 * @param {number | string | undefined | null} userType
 * @param {string} viewKey — work | analysis | create-unit 等（與 URL 片段相同）
 */
export function canSeeNavLink(userType, viewKey) {
  if (Number(userType) !== RESTRICTED_USER_TYPE) return true;
  return STUDENT_ALLOWED_VIEWS.has(viewKey);
}
