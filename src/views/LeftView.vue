<script>
  /**
   * LeftView - 主畫面左側選單
   *
   * 職責：
   * - 顯示品牌（課程名稱，由 GET /system-settings/course-name 取得）、使用者資訊、導覽連結、登出
   * - 透過 router-link 與 active-class 標示當前頁面
   * - 登出時 emit('logout') 由父層處理
   */
  import { ref, onMounted } from 'vue';
  import { API_BASE, API_GET_SYSTEM_SETTING_COURSE_NAME } from '../constants/api.js';
  import { canSeeNavLink } from '../router/permissions.js';

  export default {
    name: 'LeftView',
    props: {
      userAccount: { type: String, default: '' },
      userName: { type: String, default: '' },
      /** 後端 user_type；3 為學生，側邊欄僅顯示允許的項目 */
      userType: { type: [Number, String], default: undefined },
    },
    emits: ['logout'],
    setup(_props, { emit }) {
      const courseName = ref('AIQuiz');
      const onLogout = () => emit('logout');

      onMounted(async () => {
        try {
          const res = await fetch(`${API_BASE}${API_GET_SYSTEM_SETTING_COURSE_NAME}`, { method: 'GET' });
          if (res.ok) {
            const data = await res.json();
            if (data.course_name && String(data.course_name).trim()) {
              courseName.value = String(data.course_name).trim();
            }
          }
        } catch {
          // 保持預設 AIQuiz
        }
      });

      return {
        courseName,
        onLogout,
        canSeeNavLink,
      };
    },
  };
</script>

<template>
  <aside class="sidebar h-100">
    <div class="sidebar-brand">{{ courseName }}</div>
    <div v-if="userName" class="sidebar-user text-muted small">
      {{ userAccount }} / {{ userName }}
    </div>
    <nav class="sidebar-nav">
      <router-link
        v-if="canSeeNavLink(userType, 'work')"
        to="/exam"
        class="sidebar-link"
        active-class="active"
        >測驗</router-link
      >
      <router-link
        v-if="canSeeNavLink(userType, 'analysis')"
        to="/main/analysis"
        class="sidebar-link"
        active-class="active"
        >個人測驗分析</router-link
      >
      <router-link
        v-if="canSeeNavLink(userType, 'create-rag')"
        to="/main/create-rag"
        class="sidebar-link"
        active-class="active"
        >建立出題群組</router-link
      >
      <router-link
        v-if="canSeeNavLink(userType, 'course-analysis')"
        to="/main/course-analysis"
        class="sidebar-link"
        active-class="active"
        >課程測驗分析</router-link
      >
      <router-link
        v-if="canSeeNavLink(userType, 'users')"
        to="/main/users"
        class="sidebar-link"
        active-class="active"
        >使用者管理</router-link
      >
      <router-link
        v-if="canSeeNavLink(userType, 'settings')"
        to="/main/settings"
        class="sidebar-link"
        active-class="active"
        >系統設定</router-link
      >
      <router-link
        v-if="canSeeNavLink(userType, 'profile')"
        to="/main/profile"
        class="sidebar-link"
        active-class="active"
        >個資修改</router-link
      >
    </nav>
    <div class="sidebar-footer">
      <a class="sidebar-link sidebar-link-logout" href="#" @click.prevent="onLogout">登出</a>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 100%;
  background: #fff;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  padding: 1rem 0;
}
.sidebar-brand {
  font-weight: 600;
  font-size: 1.1rem;
  padding: 0 1rem 0.75rem;
  margin-bottom: 0.5rem;
}
.sidebar-user {
  padding: 0 1rem 0.5rem;
  margin-bottom: 0.5rem;
  line-height: 1.3;
}
.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.25rem;
  padding: 0 0.5rem;
  overflow-y: auto;
}
.sidebar-link {
  display: block;
  padding: 0.5rem 0.75rem;
  color: var(--bs-body-color);
  border-radius: 0.375rem;
  transition: background 0.15s, color 0.15s;
}
.sidebar-link:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--bs-body-color);
}
.sidebar-link.active {
  background: rgba(13, 110, 253, 0.12);
  color: var(--bs-primary);
  font-weight: 500;
}
.sidebar-footer {
  padding: 0.5rem 0.5rem 0;
  margin-top: 0.5rem;
}
.sidebar-link-logout {
  color: var(--bs-secondary);
}
.sidebar-link-logout:hover {
  color: var(--bs-danger);
  background: rgba(220, 53, 69, 0.08);
}
</style>
