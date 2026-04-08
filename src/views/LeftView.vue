<script>
  /**
   * LeftView - 主畫面左側選單
   *
   * 職責：
   * - 顯示品牌（課程名稱，由 GET /system-settings/course-name 取得）、主要導覽（測驗、作答弱點分析）
   * - 左下角使用者名下拉：出題／學生作答分析／使用者管理／系統設定、分隔線、設定、登出（/design、/create-test-bank_design 不列於選單，僅網址進入）
   * - 依 user_type 顯示允許的項目（canSeeNavLink）
   */
  import { ref, computed, onMounted } from 'vue';
  import { API_BASE, API_GET_SYSTEM_SETTING_COURSE_NAME } from '../constants/api.js';
  import { canSeeNavLink } from '../router/permissions.js';
  import { loggedFetch } from '../utils/loggedFetch.js';

  export default {
    name: 'LeftView',
    props: {
      /** 下拉按鈕顯示名稱 */
      userName: { type: String, default: '' },
      /** 後端 user_type；3 為學生，側邊欄僅顯示允許的項目 */
      userType: { type: [Number, String], default: undefined },
    },
    emits: ['logout'],
    setup(props, { emit }) {
      const courseName = ref('AIQuiz');
      const onLogout = () => emit('logout');

      const showDividerBeforeProfile = computed(() => {
        const t = props.userType;
        if (!canSeeNavLink(t, 'profile')) return false;
        return (
          canSeeNavLink(t, 'create-test-bank') ||
          canSeeNavLink(t, 'student-answer-analysis') ||
          canSeeNavLink(t, 'users') ||
          canSeeNavLink(t, 'settings') ||
          canSeeNavLink(t, 'logs')
        );
      });

      onMounted(async () => {
        try {
          const res = await loggedFetch(`${API_BASE}${API_GET_SYSTEM_SETTING_COURSE_NAME}`, { method: 'GET' });
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
        showDividerBeforeProfile,
      };
    },
  };
</script>

<template>
  <aside class="h-100 d-flex flex-column w-100 bg-white border-end">
    <div class="fw-semibold fs-5 text-body lh-sm px-3 pt-3 pb-2">{{ courseName }}</div>
    <nav class="nav nav-pills flex-column flex-grow-1 justify-content-center gap-1 overflow-auto px-3 pt-3">
      <router-link
        v-if="canSeeNavLink(userType, 'work')"
        to="/exam"
        class="nav-link"
        active-class="active"
        >測驗</router-link
      >
      <router-link
        v-if="canSeeNavLink(userType, 'student-weakness-analysis')"
        to="/student-weakness-analysis"
        class="nav-link"
        active-class="active"
        >作答弱點分析</router-link
      >
    </nav>
    <div class="flex-shrink-0 px-3 pb-2 mt-auto">
      <div class="dropdown dropup w-100">
        <button
          type="button"
          class="btn btn-outline-secondary dropdown-toggle w-100 text-start d-flex align-items-center gap-1"
          data-bs-toggle="dropdown"
          aria-expanded="false"
        >
          <span class="flex-grow-1 overflow-hidden text-truncate">{{ userName || '—' }}</span>
        </button>
        <ul class="dropdown-menu dropdown-menu-start shadow-sm w-100">
          <li v-if="canSeeNavLink(userType, 'create-test-bank')">
            <router-link class="dropdown-item" to="/create-test-bank" active-class="active">建立測驗題庫</router-link>
          </li>
          <li v-if="canSeeNavLink(userType, 'student-answer-analysis')">
            <router-link class="dropdown-item" to="/student-answer-analysis" active-class="active"
              >學生作答分析</router-link
            >
          </li>
          <li v-if="canSeeNavLink(userType, 'users')">
            <router-link class="dropdown-item" to="/manage-users" active-class="active">使用者管理</router-link>
          </li>
          <li v-if="canSeeNavLink(userType, 'settings')">
            <router-link class="dropdown-item" to="/settings" active-class="active">系統設定</router-link>
          </li>
          <li v-if="canSeeNavLink(userType, 'logs')">
            <router-link class="dropdown-item" to="/logs" active-class="active">系統紀錄</router-link>
          </li>
          <li v-if="showDividerBeforeProfile">
            <hr class="dropdown-divider" />
          </li>
          <li v-if="canSeeNavLink(userType, 'profile')">
            <router-link class="dropdown-item" to="/profile" active-class="active">設定</router-link>
          </li>
          <li>
            <hr class="dropdown-divider" />
          </li>
          <li>
            <a class="dropdown-item text-danger" href="#" @click.prevent="onLogout">登出</a>
          </li>
        </ul>
      </div>
    </div>
  </aside>
</template>
