<template>
  <el-card>
    <template #header>通知管理</template>
    <div style="width:100%;overflow-x:auto">
    <el-table :data="list">
      <el-table-column prop="Student.name" label="学生" />
      <el-table-column prop="type" label="类型">
        <template #default="{ row }">
          <el-tag :type="row.type === 'alert' ? 'danger' : 'success'">
            {{ { board: '上车', alight: '下车', alert: '告警' }[row.type] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="content" label="内容" show-overflow-tooltip />
      <el-table-column label="时间">
        <template #default="{ row }">{{ fmt(row.sent_at) }}</template>
      </el-table-column>
      <el-table-column label="状态">
        <template #default="{ row }">
          <el-tag :type="row.is_read ? 'info' : 'warning'">{{ row.is_read ? '已读' : '未读' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作">
        <template #default="{ row }">
          <el-button v-if="!row.is_read" size="small" @click="markRead(row)">标为已读</el-button>
        </template>
      </el-table-column>
    </el-table>
    </div>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../api';
import { useIsMobile } from '../composables/useIsMobile';

const { isMobile } = useIsMobile();
const list = ref([]);
function fmt(t) { return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '-'; }
async function load() { list.value = await api.get('/notifications'); }
async function markRead(row) {
  await api.put(`/notifications/${row.id}/read`);
  row.is_read = 1;
}
onMounted(load);
</script>
