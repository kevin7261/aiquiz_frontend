/**
 * 登入狀態：目前使用者（登入成功後由 API 回傳）。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAuthStore = defineStore(
  'auth',
  () => {
    /** @type {import('vue').Ref<{ user_id: number, name?: string, type?: number, created_at?: string, metadata?: unknown } | null>} */
    const user = ref(null);

    function setUser(userData) {
      user.value = userData ? { ...userData } : null;
    }

    function logout() {
      user.value = null;
    }

    return { user, setUser, logout };
  },
  { persist: true }
);
