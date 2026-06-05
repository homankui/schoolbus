<template>
  <div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f2f5">
    <el-card style="max-width:400px;width:90%">
      <h2 style="text-align:center;margin-bottom:24px">智慧校车管理系统</h2>
      <el-form :model="form" @submit.prevent="login">
        <el-form-item>
          <el-input v-model="form.username" placeholder="用户名" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" placeholder="密码" />
        </el-form-item>
        <el-button type="primary" native-type="submit" style="width:100%" :loading="loading">登录</el-button>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import api from '../api';
import { useAuthStore } from '../stores/auth';

const form = reactive({ username: '', password: '' });
const loading = ref(false);
const router = useRouter();
const auth = useAuthStore();

async function login() {
  loading.value = true;
  try {
    let data = null;
    let adminError = null;

    try {
      data = await api.post('/auth/login', form);
    } catch (error) {
      adminError = error;
      if (error.response?.status !== 401) throw error;
    }

    if (!data) {
      try {
        data = await api.post('/auth/class-teacher-login', form);
      } catch (error) {
        if (error.response?.status !== 401) throw error;
        throw adminError || error;
      }
    }

    auth.setAuth(data);
    router.push('/dashboard');
  } catch {
    ElMessage.error('登录失败，请检查用户名和密码');
  } finally {
    loading.value = false;
  }
}
</script>
