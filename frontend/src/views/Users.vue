<template>
  <el-card>
    <template #header>
      <span>用户管理</span>
      <el-button type="primary" size="small" style="float:right" @click="openDialog()">新增用户</el-button>
    </template>

    <div style="width:100%;overflow-x:auto">
    <el-table :data="list" size="small">
      <el-table-column prop="name" label="姓名" width="120" />
      <el-table-column prop="username" label="用户名" width="140" />
      <el-table-column prop="role" label="角色" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.role === 'admin'" type="danger" size="small">系统管理员</el-tag>
          <el-tag v-else-if="row.role === 'school_leader'" type="warning" size="small">学校领导</el-tag>
          <el-tag v-else type="info" size="small">运营人员</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="school_name" label="所属学校" width="180">
        <template #default="{ row }">
          {{ row.school_name || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="del(row.id)" :disabled="row.username === 'admin'">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-dialog v-model="visible" :title="form.id ? '编辑用户' : '新增用户'" :width="isMobile ? '90%' : '440px'">
      <el-form :model="form" label-width="80px">
        <el-form-item label="姓名">
          <el-input v-model="form.name" placeholder="真实姓名" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" :placeholder="form.id ? '留空不修改' : '请输入密码'" show-password />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" placeholder="选择角色" style="width:100%">
            <el-option label="系统管理员" value="admin" />
            <el-option label="学校领导" value="school_leader" />
            <el-option label="运营人员" value="operator" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属学校" v-if="form.role === 'school_leader'">
          <el-select v-model="form.school_id" placeholder="选择学校" style="width:100%">
            <el-option v-for="s in schools" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '../api';
import { useIsMobile } from '../composables/useIsMobile';

const { isMobile } = useIsMobile();
const list = ref([]);
const schools = ref([]);
const visible = ref(false);
const form = ref({});

async function load() {
  const [users, schoolsData] = await Promise.all([
    api.get('/users'),
    api.get('/schools')
  ]);
  schools.value = schoolsData;
  const schoolMap = new Map(schoolsData.map(s => [s.id, s.name]));
  list.value = users.map(u => ({
    ...u,
    school_name: u.school_id ? (schoolMap.get(u.school_id) || '') : ''
  }));
}

function openDialog(row = {}) {
  form.value = {
    id: row.id || null,
    name: row.name || '',
    username: row.username || '',
    password: '',
    role: row.role || 'operator',
    school_id: row.school_id || null
  };
  visible.value = true;
}

async function save() {
  const data = { ...form.value };

  // 新建用户必须填写密码
  if (!data.id && !data.password) {
    ElMessage.warning('请输入密码');
    return;
  }

  if (!data.password) delete data.password;
  if (!data.name) data.name = data.username;

  try {
    if (data.id) {
      await api.put(`/users/${data.id}`, data);
    } else {
      await api.post('/users', data);
    }
    visible.value = false;
    ElMessage.success('保存成功');
    load();
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || '保存失败';
    ElMessage.error(msg);
  }
}

async function del(id) {
  await ElMessageBox.confirm('确认删除该用户？');
  await api.delete(`/users/${id}`);
  ElMessage.success('删除成功');
  load();
}

onMounted(load);
</script>
