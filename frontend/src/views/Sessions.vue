<template>
  <el-card>
    <template #header>
      <span>班次管理</span>
      <span style="float:right;display:flex;gap:8px">
        <el-select v-model="filterRouteId" clearable placeholder="按路线筛选" size="small" style="width:140px" @change="load">
          <el-option v-for="r in routes" :key="r.id" :label="r.name" :value="r.id" />
        </el-select>
        <el-button size="small" @click="exportCSV">导出</el-button>
        <el-button type="primary" size="small" @click="openDialog()">新增</el-button>
      </span>
    </template>
    <el-table :data="list">
      <el-table-column prop="name" label="班次名称" />
      <el-table-column prop="type" label="类型" width="100">
        <template #default="{ row }">
          <el-tag :type="row.type==='morning'?'warning':'success'">
            {{ row.type==='morning'?'上学':'放学' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="Route.name" label="所属路线" />
      <el-table-column prop="Bus.plate" label="车辆" />
      <el-table-column prop="depart_time" label="发车时间" width="100" />
      <el-table-column label="站点" width="100">
        <template #default="{ row }">
          <el-button type="primary" link @click="goStops(row)">管理站点</el-button>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="del(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="visible" :title="form.id?'编辑班次':'新增班次'" width="440px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="班次名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="form.type">
            <el-radio value="morning">上学</el-radio>
            <el-radio value="afternoon">放学</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="所属路线">
          <el-select v-model="form.route_id" clearable>
            <el-option v-for="r in routes" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="车辆">
          <el-select v-model="form.bus_id" clearable>
            <el-option v-for="b in buses" :key="b.id" :label="b.plate" :value="b.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="发车时间">
          <el-time-picker v-model="form.depart_time" format="HH:mm" value-format="HH:mm" />
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
import { useRouter, useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '../api';
import { useSchoolStore } from '../stores/school';

const sid = useSchoolStore().current?.id;
const router = useRouter();
const route = useRoute();
const list = ref([]);
const routes = ref([]);
const buses = ref([]);
const visible = ref(false);
const form = ref({});
const filterRouteId = ref(route.query.route_id ? +route.query.route_id : null);

function goStops(row) { router.push({ path: '/stops', query: { session_id: row.id } }); }

async function load() {
  const params = { school_id: sid };
  if (filterRouteId.value) params.route_id = filterRouteId.value;
  [list.value, routes.value, buses.value] = await Promise.all([
    api.get('/sessions', { params }),
    api.get('/routes', { params: { school_id: sid } }),
    api.get('/buses',  { params: { school_id: sid } })
  ]);
}

function openDialog(row = {}) { form.value = { school_id: sid, ...row }; visible.value = true; }

async function save() {
  if (form.value.id) await api.put(`/sessions/${form.value.id}`, form.value);
  else await api.post('/sessions', form.value);
  visible.value = false; ElMessage.success('保存成功'); load();
}

async function del(id) {
  await ElMessageBox.confirm('确认删除？');
  await api.delete(`/sessions/${id}`); ElMessage.success('删除成功'); load();
}

function exportCSV() { window.open(`/api/sessions/export?school_id=${sid}`); }

onMounted(load);
</script>
