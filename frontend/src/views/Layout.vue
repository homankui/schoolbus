<template>
  <el-container style="height:100vh">
    <el-aside width="210px" style="background:#001529;overflow-y:auto">
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
    <el-container>
      <el-header style="background:#fff;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eee;padding:0 20px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="color:#999;font-size:13px">当前学校：</span>
          <el-select
            :model-value="schoolStore.current?.id"
            placeholder="请选择学校"
            style="width:200px"
            @change="onSchoolChange"
          >
            <el-option v-for="s in schools" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="color:#666;font-size:13px">{{ authStore.username }}</span>
          <el-button size="small" @click="authStore.logout()">退出</el-button>
        </div>
      </el-header>
      <el-main style="background:#f0f2f5;overflow-y:auto">
        <el-empty v-if="!schoolStore.current" description="请先在顶部选择学校" style="margin-top:80px" />
        <router-view v-else />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useSchoolStore } from '../stores/school';
import api from '../api';

const authStore = useAuthStore();
const schoolStore = useSchoolStore();
const schools = ref([]);

async function loadSchools() {
  schools.value = await api.get('/schools');
  if (!schoolStore.current && schools.value.length) {
    schoolStore.select(schools.value[0]);
  }
}

function onSchoolChange(id) {
  const school = schools.value.find(s => s.id === id);
  if (school) schoolStore.select(school);
}

onMounted(loadSchools);

const menus = [
  { title: '概览', items: [
    { path: '/dashboard', label: '首页概览' },
    { path: '/map',       label: '实时地图' }
  ]},
  { title: '系统管理', items: [
    { path: '/schools', label: '学校管理' }
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
    { path: '/class-teachers', label: '班级老师' }
  ]},
  { title: '记录通知', items: [
    { path: '/ride-assign',   label: '搭乘管理' },
    { path: '/records',       label: '乘车记录' },
    { path: '/notifications', label: '通知管理' }
  ]}
];
</script>
