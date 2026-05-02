<template>
  <el-card>
    <template #header>
      <span>车队管理</span>
      <el-button type="primary" size="small" style="float:right" @click="openDialog()">新增车队</el-button>
    </template>

    <el-table :data="list">
      <el-table-column prop="name" label="车队名称" />
      <el-table-column label="所属学校">
        <template #default="{ row }">{{ row.School?.name || '-' }}</template>
      </el-table-column>
      <el-table-column label="车辆数">
        <template #default="{ row }">
          <el-tag type="info" size="small">{{ busCount(row.id) }} 辆</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="司机数">
        <template #default="{ row }">
          <el-tag type="info" size="small">{{ driverCount(row.id) }} 人</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="del(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="visible" :title="form.id ? '编辑车队' : '新增车队'" width="380px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="车队名称">
          <el-input v-model="form.name" placeholder="如：第一车队" />
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
import { useSchoolStore } from '../stores/school';

const sid = useSchoolStore().current?.id;
const list    = ref([]);
const buses   = ref([]);
const drivers = ref([]);
const visible = ref(false);
const form    = ref({});

function busCount(fleetId)   { return buses.value.filter(b => b.fleet_id === fleetId).length; }
function driverCount(fleetId){ return drivers.value.filter(d => d.fleet_id === fleetId).length; }

async function load() {
  [list.value, buses.value, drivers.value] = await Promise.all([
    api.get('/fleets',  { params: { school_id: sid } }),
    api.get('/buses',   { params: { school_id: sid } }),
    api.get('/drivers', { params: { school_id: sid } })
  ]);
}

function openDialog(row = {}) {
  form.value = { school_id: sid, ...row };
  visible.value = true;
}

async function save() {
  if (form.value.id) await api.put(`/fleets/${form.value.id}`, form.value);
  else await api.post('/fleets', form.value);
  visible.value = false;
  ElMessage.success('保存成功');
  load();
}

async function del(id) {
  const bound = busCount(id) + driverCount(id);
  if (bound > 0) {
    await ElMessageBox.confirm(`该车队下还有 ${bound} 辆车/司机，删除后关联将丢失，确认删除？`, '警告', { type: 'warning' });
  } else {
    await ElMessageBox.confirm('确认删除该车队？');
  }
  await api.delete(`/fleets/${id}`);
  ElMessage.success('删除成功');
  load();
}

onMounted(load);
</script>
