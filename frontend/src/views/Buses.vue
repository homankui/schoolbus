<template>
  <el-card>
    <template #header>
      <span>车辆管理</span>
      <span style="float:right;display:flex;gap:8px">
        <el-button size="small" @click="exportCSV">导出</el-button>
        <el-button type="primary" size="small" @click="openDialog()">新增</el-button>
      </span>
    </template>
    <div style="width:100%;overflow-x:auto">
    <el-table :data="list">
      <el-table-column prop="plate" label="车牌" />
      <el-table-column prop="model" label="型号" />
      <el-table-column prop="capacity" label="载客量" width="80" />
      <el-table-column prop="Fleet.name" label="车队" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status==='active'?'success':row.status==='maintenance'?'warning':'info'">
            {{ {active:'运营中',inactive:'停运',maintenance:'维修中'}[row.status] }}
          </el-tag>
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

    <el-dialog v-model="visible" :title="form.id?'编辑车辆':'新增车辆'" :width="isMobile ? '90%' : '420px'">
      <el-form :model="form" label-width="80px">
        <el-form-item label="车牌"><el-input v-model="form.plate" /></el-form-item>
        <el-form-item label="型号"><el-input v-model="form.model" /></el-form-item>
        <el-form-item label="载客量"><el-input-number v-model="form.capacity" :min="1" /></el-form-item>
        <el-form-item label="车队">
          <el-select v-model="form.fleet_id" clearable>
            <el-option v-for="f in fleets" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status">
            <el-option label="运营中" value="active" />
            <el-option label="停运" value="inactive" />
            <el-option label="维修中" value="maintenance" />
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
const list = ref([]);
const fleets = ref([]);
const visible = ref(false);
const form = ref({});

async function load() {
  [list.value, fleets.value] = await Promise.all([
    api.get('/buses', { params: { school_id: sid } }),
    api.get('/fleets', { params: { school_id: sid } })
  ]);
}

function openDialog(row = {}) { form.value = { school_id: sid, ...row }; visible.value = true; }

async function save() {
  if (form.value.id) await api.put(`/buses/${form.value.id}`, form.value);
  else await api.post('/buses', form.value);
  visible.value = false; ElMessage.success('保存成功'); load();
}

async function del(id) {
  await ElMessageBox.confirm('确认删除？');
  await api.delete(`/buses/${id}`); ElMessage.success('删除成功'); load();
}

function exportCSV() { window.open(`/api/buses/export?school_id=${sid}`); }

onMounted(load);
</script>
