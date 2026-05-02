<template>
  <el-card>
    <template #header>
      <span>司机管理</span>
      <span style="float:right;display:flex;gap:8px">
        <el-button size="small" @click="exportCSV">导出</el-button>
        <el-button type="primary" size="small" @click="openDialog()">新增</el-button>
      </span>
    </template>
    <el-table :data="list">
      <el-table-column prop="name" label="姓名" />
      <el-table-column prop="phone" label="电话" />
      <el-table-column prop="license" label="驾照号" />
      <el-table-column prop="Fleet.name" label="车队" />
      <el-table-column prop="Bus.plate" label="所属车辆" />
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="del(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="visible" :title="form.id?'编辑司机':'新增司机'" width="420px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="驾照号"><el-input v-model="form.license" /></el-form-item>
        <el-form-item label="车队">
          <el-select v-model="form.fleet_id" clearable @change="form.bus_id=null">
            <el-option v-for="f in fleets" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属车辆">
          <el-select v-model="form.bus_id" clearable>
            <el-option v-for="b in filteredBuses" :key="b.id" :label="b.plate" :value="b.id" />
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
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '../api';
import { useSchoolStore } from '../stores/school';

const sid = useSchoolStore().current?.id;
const list = ref([]);
const fleets = ref([]);
const buses = ref([]);
const visible = ref(false);
const form = ref({});

const filteredBuses = computed(() =>
  form.value.fleet_id ? buses.value.filter(b => b.fleet_id === form.value.fleet_id) : buses.value
);

async function load() {
  [list.value, fleets.value, buses.value] = await Promise.all([
    api.get('/drivers', { params: { school_id: sid } }),
    api.get('/fleets',  { params: { school_id: sid } }),
    api.get('/buses',   { params: { school_id: sid } })
  ]);
}

function openDialog(row = {}) { form.value = { school_id: sid, ...row }; visible.value = true; }

async function save() {
  if (form.value.id) await api.put(`/drivers/${form.value.id}`, form.value);
  else await api.post('/drivers', form.value);
  visible.value = false; ElMessage.success('保存成功'); load();
}

async function del(id) {
  await ElMessageBox.confirm('确认删除？');
  await api.delete(`/drivers/${id}`); ElMessage.success('删除成功'); load();
}

function exportCSV() { window.open(`/api/drivers/export?school_id=${sid}`); }

onMounted(load);
</script>
