/**
 * 依 user_type 限制可進入的路由（與側邊欄顯示）
 *
 * 1=開發者、2=管理者：除「系統 Log」外之全部頁面
 * 3=學生：僅測驗（/exam）、作答弱點分析（/student-weakness-analysis）、設定（/profile）
 * 「系統 Log」（/logs）：僅 user_type=1
 */

export const DEVELOPER_USER_TYPE = 1;
export const MANAGER_USER_TYPE = 2;
export const RESTRICTED_USER_TYPE = 3;

/** 使用者管理與畫面顯示用：1 開發者、2 管理者、3 學生；其餘見 userTypeLabel →「未知」 */
export const USER_TYPE_LABELS = Object.freeze({
  [DEVELOPER_USER_TYPE]: '開發者',
  [MANAGER_USER_TYPE]: '管理者',
  [RESTRICTED_USER_TYPE]: '學生',
});

/** 非 1／2／3 的 user_type 顯示文字 */
export const UNKNOWN_USER_TYPE_LABEL = '未知';

/**
 * user_type 顯示：1 開發者、2 管理者、3 學生；空值為 —；無法解析或非上述數值為「未知」
 * @param {number | string | null | undefined} userType
 * @returns {string}
 */
export function userTypeLabel(userType) {
  if (userType == null || userType === '') return '—';
  const n = Number(userType);
  if (Number.isNaN(n)) return UNKNOWN_USER_TYPE_LABEL;
  return USER_TYPE_LABELS[n] ?? UNKNOWN_USER_TYPE_LABEL;
}

/** 學生可進入的 view 參數（/:view）以及測驗對應的內部鍵 work */
export const STUDENT_ALLOWED_VIEWS = new Set(['work', 'student-weakness-analysis', 'profile']);

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
  const key = routeViewKey(to);
  if (key === 'logs' && Number(user.user_type) !== DEVELOPER_USER_TYPE) return false;
  if (Number(user.user_type) !== RESTRICTED_USER_TYPE) return true;
  if (key == null) return true;
  return STUDENT_ALLOWED_VIEWS.has(key);
}

/**
 * 側邊欄單一連結是否顯示（與 route 權限一致）
 * @param {number | string | undefined | null} userType
 * @param {string} viewKey — work | student-weakness-analysis | create-exam-bank 等（與 URL 片段相同）
 */
export function canSeeNavLink(userType, viewKey) {
  if (viewKey === 'logs') return Number(userType) === DEVELOPER_USER_TYPE;
  if (Number(userType) !== RESTRICTED_USER_TYPE) return true;
  return STUDENT_ALLOWED_VIEWS.has(viewKey);
}
