<template>
  <el-card>
    <template #header>
      <span>乘车记录</span>
      <el-date-picker v-model="date" type="date" placeholder="按日期筛选" value-format="YYYY-MM-DD"
        style="float:right;width:160px" @change="load" clearable />
    </template>
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
    <el-pagination style="margin-top:12px" :total="total" :page-size="pageSize"
      v-model:current-page="page" @current-change="load" layout="total, prev, pager, next" />
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../api';

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

onMounted(load);
</script>
