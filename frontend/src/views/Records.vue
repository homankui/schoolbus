<template>
  <el-card>
    <template #header>
      <span>乘车记录</span>
      <div style="float:right;display:flex;gap:8px">
        <el-date-picker v-model="date" type="date" placeholder="按日期筛选" value-format="YYYY-MM-DD"
          style="width:160px" @change="load" clearable />
        <el-button type="primary" @click="exportCSV">导出</el-button>
      </div>
    </template>
    <div style="width:100%;overflow-x:auto">
    <el-table :data="list">
      <el-table-column prop="Student.name" label="学生" />
      <el-table-column prop="Bus.plate" label="车牌" />
      <el-table-column prop="board_stop" label="上车站" />
      <el-table-column prop="alight_stop" label="下车站" />
      <el-table-column label="上车时间">
        <template #default="{ row }">{{ fmt(row.board_time) }}</template>
      </el-table-column>
      <el-table-column label="下车时间">
        <template #default="{ row }">{{ fmt(row.alight_time) }}</template>
      </el-table-column>
    </el-table>
    </div>
    <el-pagination style="margin-top:12px" :total="total" :page-size="pageSize"
      v-model:current-page="page" @current-change="load" layout="total, prev, pager, next" />
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api, { requestRaw } from '../api';
import { useIsMobile } from '../composables/useIsMobile';

const { isMobile } = useIsMobile();
const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const date = ref('');

function fmt(t) { return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '-'; }

async function load() {
  const params = { page: page.value, pageSize };
  if (date.value) params.date = date.value;
  const res = await api.get('/ride-records', { params });
  list.value = res.data;
  total.value = res.total;
}

async function exportCSV() {
  const params = {};
  if (date.value) params.date = date.value;
  const res = await requestRaw({
    url: '/ride-records/export',
    method: 'GET',
    params,
    responseType: 'blob'
  });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = `乘车记录${date.value ? '_' + date.value : ''}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

onMounted(load);
</script>
