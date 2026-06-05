<template>
  <el-card>
    <template #header>
      <span>跟车老师管理</span>
      <el-button type="primary" size="small" style="float:right" @click="openDialog()">新增</el-button>
    </template>

    <div style="width:100%;overflow-x:auto">
    <el-table :data="list" size="small">
      <el-table-column prop="name" label="姓名" width="90" />
      <el-table-column prop="phone" label="电话" width="130" />
      <el-table-column prop="username" label="用户名" width="110" />
      <el-table-column label="绑定班次" min-width="200">
        <template #default="{ row }">
          <el-tag v-for="s in row.Sessions" :key="s.id"
            :type="s.type==='morning'?'warning':'success'"
            size="small" style="margin-right:4px">{{ s.name }}</el-tag>
          <el-tag v-if="!row.Sessions?.length" type="info" size="small">未绑定</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="del(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-dialog v-model="visible" :title="form.id?'编辑跟车老师':'新增跟车老师'" :width="isMobile ? '90%' : '440px'">
      <el-form :model="form" label-width="80px">
        <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="用户名"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" :placeholder="form.id?'留空不修改':'请输入密码'" show-password />
        </el-form-item>
        <el-form-item label="绑定班次">
          <el-select v-model="form.session_ids" multiple placeholder="选择班次" style="width:100%">
            <el-option v-for="s in sessions" :key="s.id"
              :label="`${s.name}（${s.type==='morning'?'上学':'放学'}）`" :value="s.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible=false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '../api';
import { useSchoolStore } from '../stores/school';
import { useIsMobile } from '../composables/useIsMobile';

const { isMobile } = useIsMobile();
const sid = useSchoolStore().current?.id;
const list     = ref([]);
const sessions = ref([]);
const visible  = ref(false);
const form     = ref({});

async function load() {
  [list.value, sessions.value] = await Promise.all([
    api.get('/escort-teachers', { params: { school_id: sid } }),
    api.get('/sessions',        { params: { school_id: sid } })
  ]);
}

function openDialog(row = {}) {
  form.value = { school_id: sid, session_ids: [], ...row, password: '' };
  visible.value = true;
}

async function save() {
  const data = { ...form.value };
  if (!data.password) delete data.password;
  if (data.id) await api.put(`/escort-teachers/${data.id}`, data);
  else await api.post('/escort-teachers', data);
  visible.value = false;
  ElMessage.success('保存成功');
  load();
}

async function del(id) {
  await ElMessageBox.confirm('确认删除该跟车老师？');
  await api.delete(`/escort-teachers/${id}`);
  ElMessage.success('删除成功');
  load();
}

onMounted(load);
</script>
