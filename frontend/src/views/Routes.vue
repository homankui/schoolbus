<template>
  <el-card>
    <template #header>
      <span>路线管理</span>
      <el-button type="primary" size="small" style="float:right" @click="openDialog()">新增路线</el-button>
    </template>
    <div style="width:100%;overflow-x:auto">
    <el-table :data="list" row-key="id">
      <el-table-column prop="name" label="路线名称" />
      <el-table-column label="班次数">
        <template #default="{ row }">
          <el-button type="primary" link @click="viewSessions(row)">
            {{ sessionCount(row.id) }} 个班次
          </el-button>
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

    <el-dialog v-model="visible" :title="form.id?'编辑路线':'新增路线'" :width="isMobile ? '90%' : '380px'">
      <el-form :model="form" label-width="80px">
        <el-form-item label="路线名称"><el-input v-model="form.name" /></el-form-item>
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
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '../api';
import { useSchoolStore } from '../stores/school';
import { useIsMobile } from '../composables/useIsMobile';

const { isMobile } = useIsMobile();
const sid = useSchoolStore().current?.id;
const router = useRouter();
const list = ref([]);
const sessions = ref([]);
const visible = ref(false);
const form = ref({});

function sessionCount(routeId) { return sessions.value.filter(s => s.route_id === routeId).length; }
function viewSessions(row) { router.push({ path: '/sessions', query: { route_id: row.id } }); }

async function load() {
  [list.value, sessions.value] = await Promise.all([
    api.get('/routes',   { params: { school_id: sid } }),
    api.get('/sessions', { params: { school_id: sid } })
  ]);
}

function openDialog(row = {}) { form.value = { school_id: sid, ...row }; visible.value = true; }

async function save() {
  if (form.value.id) await api.put(`/routes/${form.value.id}`, form.value);
  else await api.post('/routes', form.value);
  visible.value = false; ElMessage.success('保存成功'); load();
}

async function del(id) {
  await ElMessageBox.confirm('确认删除？');
  await api.delete(`/routes/${id}`); ElMessage.success('删除成功'); load();
}

onMounted(load);
</script>
