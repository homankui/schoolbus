<template>
  <div>
    <div style="margin-bottom:16px;font-size:18px;font-weight:bold;color:#333">
      {{ schoolStore.current?.name }} — 概览
    </div>
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="6" v-for="card in stats" :key="card.label">
        <el-card shadow="hover">
          <div style="font-size:32px;font-weight:bold;color:#409eff">{{ card.value }}</div>
          <div style="color:#999;margin-top:6px">{{ card.label }}</div>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="16">
      <el-col :span="12">
        <el-card>
          <template #header>今日乘车记录</template>
          <el-table :data="recentRecords" size="small">
            <el-table-column prop="Student.name" label="学生" width="80" />
            <el-table-column prop="Bus.plate" label="车牌" width="100" />
            <el-table-column prop="board_stop" label="上车站" />
            <el-table-column label="上车时间">
              <template #default="{ row }">{{ fmt(row.board_time) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header>最新通知</template>
          <el-table :data="notifications" size="small">
            <el-table-column prop="Student.name" label="学生" width="80" />
            <el-table-column prop="content" label="内容" show-overflow-tooltip />
            <el-table-column label="时间" width="100">
              <template #default="{ row }">{{ fmt(row.sent_at) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../api';
import { useSchoolStore } from '../stores/school';

const schoolStore = useSchoolStore();
const sid = schoolStore.current?.id;

const stats = ref([
  { label: '在运车辆', value: 0 },
  { label: '学生总数', value: 0 },
  { label: '今日乘车', value: 0 },
  { label: '未读通知', value: 0 }
]);
const recentRecords = ref([]);
const notifications = ref([]);

function fmt(t) { return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }).slice(5) : '-'; }

onMounted(async () => {
  const [summary, records, notifs] = await Promise.all([
    api.get('/dashboard', { params: { school_id: sid } }),
    api.get('/ride-records', { params: { school_id: sid, pageSize: 5 } }),
    api.get('/notifications', { params: { school_id: sid } })
  ]);
  stats.value[0].value = summary.activeBuses;
  stats.value[1].value = summary.totalStudents;
  stats.value[2].value = summary.todayRides;
  stats.value[3].value = summary.unreadNotifs;
  recentRecords.value = records.data;
  notifications.value = notifs.slice(0, 5);
});
</script>
