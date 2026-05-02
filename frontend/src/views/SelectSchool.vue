<template>
  <div style="min-height:100vh;background:linear-gradient(135deg,#1890ff 0%,#096dd9 100%);display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div style="color:#fff;font-size:28px;font-weight:bold;margin-bottom:8px">智慧校车管理系统</div>
    <div style="color:rgba(255,255,255,0.8);margin-bottom:40px">请选择您要管理的学校</div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;justify-content:center;max-width:900px">
      <div
        v-for="school in schools" :key="school.id"
        @click="choose(school)"
        style="background:#fff;border-radius:12px;padding:32px 40px;cursor:pointer;min-width:220px;text-align:center;transition:transform .2s,box-shadow .2s"
        @mouseenter="e => e.currentTarget.style.transform='translateY(-4px)'"
        @mouseleave="e => e.currentTarget.style.transform=''"
      >
        <div style="font-size:48px;margin-bottom:12px">🏫</div>
        <div style="font-size:18px;font-weight:bold;color:#333">{{ school.name }}</div>
        <div style="font-size:13px;color:#999;margin-top:6px">{{ school.address }}</div>
      </div>
    </div>
    <div style="margin-top:32px">
      <el-button type="text" style="color:rgba(255,255,255,0.7)" @click="authStore.logout()">退出登录</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api';
import { useSchoolStore } from '../stores/school';
import { useAuthStore } from '../stores/auth';

const schools = ref([]);
const schoolStore = useSchoolStore();
const authStore = useAuthStore();
const router = useRouter();

onMounted(async () => { schools.value = await api.get('/schools'); });

function choose(school) {
  schoolStore.select(school);
  router.push('/dashboard');
}
</script>
