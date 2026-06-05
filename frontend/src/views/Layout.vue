<template>
  <el-container style="height:100vh">
    <!-- 桌面端侧边栏 -->
    <el-aside v-show="!isMobile" width="210px" style="background:#001529;overflow-y:auto">
      <div style="color:#fff;text-align:center;padding:18px 12px 14px;font-size:15px;font-weight:bold;border-bottom:1px solid #0d2a4a">
        智慧校车管理系统
      </div>
      <el-menu router background-color="#001529" text-color="#aaa" active-text-color="#fff" :default-active="$route.path">
        <div v-for="group in menus" :key="group.title">
          <div style="color:#555;font-size:11px;padding:12px 16px 4px">{{ group.title }}</div>
          <el-menu-item v-for="item in group.items" :key="item.path" :index="item.path" style="height:40px;line-height:40px">
            <span>{{ item.label }}</span>
          </el-menu-item>
        </div>
      </el-menu>
    </el-aside>

    <!-- 移动端抽屉菜单 -->
    <el-drawer
      v-if="isMobile"
      v-model="drawerVisible"
      direction="ltr"
      size="240px"
      :with-header="false"
      :z-index="3000"
    >
      <div style="background:#001529;min-height:100vh">
        <div style="color:#fff;text-align:center;padding:18px 12px 14px;font-size:15px;font-weight:bold;border-bottom:1px solid #0d2a4a">
          智慧校车管理系统
        </div>
        <el-menu router background-color="#001529" text-color="#aaa" active-text-color="#fff" :default-active="$route.path" @select="onMenuSelect">
          <div v-for="group in menus" :key="group.title">
            <div style="color:#555;font-size:11px;padding:12px 16px 4px">{{ group.title }}</div>
            <el-menu-item v-for="item in group.items" :key="item.path" :index="item.path" style="height:40px;line-height:40px">
              <span>{{ item.label }}</span>
            </el-menu-item>
          </div>
        </el-menu>
      </div>
    </el-drawer>

    <el-container>
      <el-header class="app-header" style="background:#fff;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eee;padding:0 20px">
        <div style="display:flex;align-items:center;gap:10px">
          <el-button v-if="isMobile" link @click="drawerVisible = true" style="font-size:22px;padding:0">&#9776;</el-button>
          <span class="school-label" style="color:#999;font-size:13px">当前学校：</span>
          <el-select
            :model-value="schoolStore.current?.id"
            placeholder="请选择学校"
            :style="{ width: isMobile ? '120px' : '200px' }"
            :disabled="authStore.isClassTeacher || authStore.isSchoolLeader"
            @change="onSchoolChange"
          >
            <el-option v-for="s in schools" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="username-label" style="color:#666;font-size:13px">{{ authStore.username }}</span>
          <el-button size="small" @click="authStore.logout()">退出</el-button>
        </div>
      </el-header>
      <el-main style="background:#f0f2f5;overflow-y:auto">
        <el-empty v-if="!schoolStore.current && !authStore.isClassTeacher && !authStore.isSchoolLeader" description="请先在顶部选择学校" style="margin-top:80px" />
        <router-view v-else />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useSchoolStore } from '../stores/school';
import { useIsMobile } from '../composables/useIsMobile';
import api from '../api';

const route = useRoute();
const authStore = useAuthStore();
const schoolStore = useSchoolStore();
const schools = ref([]);
const { isMobile } = useIsMobile();
const drawerVisible = ref(false);

function onMenuSelect() {
  drawerVisible.value = false;
}

watch(() => route.path, () => {
  drawerVisible.value = false;
});

async function loadSchools() {
  schools.value = await api.get('/schools');

  if (authStore.isClassTeacher || authStore.isSchoolLeader) {
    const userSchoolId = Number(authStore.schoolId || 0);
    const matchedSchool = schools.value.find(s => s.id === userSchoolId) || null;
    if (matchedSchool) schoolStore.select(matchedSchool);
    return;
  }

  if (!schoolStore.current && schools.value.length) {
    schoolStore.select(schools.value[0]);
  }
}

function onSchoolChange(id) {
  if (authStore.isClassTeacher || authStore.isSchoolLeader) return;
  const school = schools.value.find(s => s.id === id);
  if (school) schoolStore.select(school);
}

onMounted(loadSchools);

const menus = computed(() => {
  if (authStore.isClassTeacher) {
    return [
      { title: '班级老师', items: [
        { path: '/students', label: '学生管理' },
        { path: '/leave-requests', label: '请假记录' }
      ]}
    ];
  }

  const baseMenus = [
    { title: '概览', items: [
      { path: '/dashboard', label: '首页概览' },
      { path: '/map',       label: '实时地图' },
      { path: '/trajectory', label: '轨迹回放' }
    ]},
    { title: '车辆运营', items: [
      { path: '/fleets',          label: '车队管理' },
      { path: '/buses',           label: '车辆管理' },
      { path: '/drivers',         label: '司机管理' },
      { path: '/escort-teachers', label: '跟车老师' },
      { path: '/routes',          label: '路线管理' },
      { path: '/sessions',        label: '班次管理' },
      { path: '/stops',           label: '站点管理' }
    ]},
    { title: '学生管理', items: [
      { path: '/grades',         label: '年级/班级' },
      { path: '/students',       label: '学生管理' },
      { path: '/parent-binding', label: '公众号绑定' },
      { path: '/class-teachers', label: '班级老师' }
    ]},
    { title: '记录通知', items: [
      { path: '/ride-assign',    label: '搭乘管理' },
      { path: '/records',        label: '乘车记录' },
      { path: '/leave-requests', label: '请假记录' },
      { path: '/notifications',  label: '通知管理' },
      { path: '/stress-test',    label: '推送压测' }
    ]}
  ];

  // 系统管理
  const systemItems = [];
  if (authStore.isAdmin) {
    systemItems.push({ path: '/schools', label: '学校管理' });
  }
  if (authStore.isAdmin || authStore.isSchoolLeader || authStore.isOperator) {
    systemItems.push({ path: '/users', label: '用户管理' });
  }
  if (systemItems.length) {
    baseMenus.splice(1, 0, { title: '系统管理', items: systemItems });
  }

  return baseMenus;
});
</script>

<style scoped>
@media (max-width: 768px) {
  .app-header { padding: 0 10px !important; }
  .school-label { display: none; }
  .username-label { display: none; }
}
</style>
