/**
 * 認證狀態 Store（Pinia）
 *
 * 職責：
 * - 存放目前登入使用者資料（登入成功後由 API 回傳並透過 setUser 寫入）
 * - 提供 setUser、logout，供登入頁與導航守衛使用
 * - 啟用 persist，重新整理後仍保留登入狀態（依 pinia-plugin-persistedstate）
 *
 * 使用者物件欄位：user_id, person_id, name, user_type, llm_api_key 等（依後端 API）
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAuthStore = defineStore(
  'auth',
  () => {
    /** @type {import('vue').Ref<{ user_id: number, person_id: string, name?: string, password?: string, user_type?: number, llm_api_key?: string, user_metadata?: unknown, updated_at?: string, created_at?: string } | null>} 目前登入使用者，未登入為 null */
    const user = ref(null);

    /**
     * 設定目前使用者（登入成功時呼叫）
     * @param {object | null} userData - 後端回傳的使用者物件；傳 null 會清空
     */
    function setUser(userData) {
      if (!userData) {
        user.value = null;
        return;
      }
      const u = { ...userData };
      // 後端可能回傳 id 而非 user_id，統一設為 user_id 供前端與 API 使用
      if (u.user_id == null && u.id != null) u.user_id = u.id;
      user.value = u;
    }

    /** 登出：清空 user，導航守衛會導向 /login */
    function logout() {
      user.value = null;
    }

    return { user, setUser, logout };
  },
  { persist: true }
);
