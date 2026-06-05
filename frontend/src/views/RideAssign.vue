<template>
  <el-card>
    <template #header>
      <span>搭乘管理</span>
      <span style="float:right;display:flex;gap:8px;flex-wrap:wrap">
        <el-button size="small" @click="downloadTemplate">下载导入模板</el-button>
        <el-button size="small" @click="downloadChangeTemplate">下载调班模板</el-button>
        <el-upload :show-file-list="false" accept=".csv" :before-upload="handleImport">
          <el-button size="small">批量导入</el-button>
        </el-upload>
        <el-upload :show-file-list="false" accept=".csv" :before-upload="handleChangeImport">
          <el-button size="small">调班模板导入</el-button>
        </el-upload>
        <el-button size="small" @click="exportCSV">导出</el-button>
      </span>
    </template>

    <el-row :gutter="10" style="margin-bottom:14px">
      <el-col :xs="12" :sm="5">
        <el-input v-model="filter.name" placeholder="搜索姓名" clearable @input="load" />
      </el-col>
      <el-col :xs="12" :sm="4">
        <el-select v-model="filter.grade_id" clearable placeholder="年级" @change="filter.class_id=null;load()">
          <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-col>
      <el-col :xs="12" :sm="4">
        <el-select v-model="filter.class_id" clearable placeholder="班级" @change="load">
          <el-option v-for="c in filteredClasses" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-col>
      <el-col :xs="12" :sm="5">
        <el-select v-model="filter.session_id" clearable placeholder="按班次筛选" @change="load">
          <el-option label="未分配任何班次" :value="-1" />
          <el-option v-for="s in sessions" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
      </el-col>
    </el-row>

    <div style="width:100%;overflow-x:auto">
      <el-table :data="list" row-key="id" style="width:100%">
      <el-table-column prop="name" label="姓名" width="90" fixed="left" />
      <el-table-column prop="Grade.name" label="年级" width="80" fixed="left" />
      <el-table-column prop="Class.name" label="班级" width="80" fixed="left" />

      <el-table-column label="上学搭乘信息" min-width="420">
        <template #default="{ row }">
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
            <el-select
              v-model="row.morning.session_id"
              clearable
              placeholder="上学班次"
              size="small"
              @change="handleSessionChange(row, 'morning')"
            >
              <el-option v-for="s in morningSessions" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
            <el-select
              v-model="row.morning.board_stop_id"
              clearable
              filterable
              placeholder="上车站点"
              size="small"
              :disabled="!row.morning.session_id"
            >
              <el-option
                v-for="stop in stopOptionsBySession(row.morning.session_id)"
                :key="`mb-${stop.id}`"
                :label="stop.name"
                :value="stop.id"
              />
            </el-select>
            <el-select
              v-model="row.morning.alight_stop_id"
              clearable
              filterable
              placeholder="下车站点"
              size="small"
              :disabled="!row.morning.session_id"
            >
              <el-option
                v-for="stop in stopOptionsBySession(row.morning.session_id)"
                :key="`ma-${stop.id}`"
                :label="stop.name"
                :value="stop.id"
              />
            </el-select>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="放学搭乘信息" min-width="420">
        <template #default="{ row }">
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
            <el-select
              v-model="row.afternoon.session_id"
              clearable
              placeholder="放学班次"
              size="small"
              @change="handleSessionChange(row, 'afternoon')"
            >
              <el-option v-for="s in afternoonSessions" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
            <el-select
              v-model="row.afternoon.board_stop_id"
              clearable
              filterable
              placeholder="上车站点"
              size="small"
              :disabled="!row.afternoon.session_id"
            >
              <el-option
                v-for="stop in stopOptionsBySession(row.afternoon.session_id)"
                :key="`ab-${stop.id}`"
                :label="stop.name"
                :value="stop.id"
              />
            </el-select>
            <el-select
              v-model="row.afternoon.alight_stop_id"
              clearable
              filterable
              placeholder="下车站点"
              size="small"
              :disabled="!row.afternoon.session_id"
            >
              <el-option
                v-for="stop in stopOptionsBySession(row.afternoon.session_id)"
                :key="`aa-${stop.id}`"
                :label="stop.name"
                :value="stop.id"
              />
            </el-select>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="160" fixed="right" align="center" header-align="center">
        <template #default="{ row }">
          <div style="display:flex;gap:8px;justify-content:center;align-items:center;white-space:nowrap">
            <el-button size="small" type="primary" @click="saveRow(row)">保存</el-button>
            <el-button size="small" @click="clearRow(row)">清空</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-dialog v-model="importResultDialog" title="导入结果" width="480px">
      <el-alert :title="`成功更新 ${importResult.updated} 条`" type="success" :closable="false" style="margin-bottom:10px" />
      <div v-if="importResult.errors?.length">
        <div style="color:#e6a23c;font-weight:bold;margin-bottom:6px">以下行有问题：</div>
        <div v-for="e in importResult.errors" :key="e" style="font-size:13px;color:#f56c6c">{{ e }}</div>
      </div>
      <template #footer>
        <el-button type="primary" @click="importResultDialog=false;load()">确定</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import api, { requestRaw } from '../api';
import { useSchoolStore } from '../stores/school';

const sid = useSchoolStore().current?.id;

const list = ref([]);
const grades = ref([]);
const classes = ref([]);
const sessions = ref([]);
const stopMap = ref({});
const importResultDialog = ref(false);
const importResult = ref({});

const filter = ref({ name: '', grade_id: null, class_id: null, session_id: null });

const filteredClasses = computed(() =>
  filter.value.grade_id ? classes.value.filter(c => c.grade_id === filter.value.grade_id) : classes.value
);
const morningSessions = computed(() => sessions.value.filter(session => session.type === 'morning'));
const afternoonSessions = computed(() => sessions.value.filter(session => session.type === 'afternoon'));

function buildEmptySlot() {
  return {
    session_id: null,
    session_name: '',
    board_stop_id: null,
    board_stop_name: '',
    alight_stop_id: null,
    alight_stop_name: ''
  };
}

function normalizeRow(row) {
  return {
    ...row,
    morning: { ...buildEmptySlot(), ...(row.morning || {}) },
    afternoon: { ...buildEmptySlot(), ...(row.afternoon || {}) }
  };
}

async function ensureStopsForSession(sessionId) {
  const sidValue = Number(sessionId || 0);
  if (!sidValue || stopMap.value[sidValue]) return;
  const stops = await api.get('/stops', { params: { session_id: sidValue } });
  stopMap.value = { ...stopMap.value, [sidValue]: stops };
}

function stopOptionsBySession(sessionId) {
  return stopMap.value[Number(sessionId || 0)] || [];
}

async function warmRowStops(row) {
  await Promise.all([
    ensureStopsForSession(row.morning?.session_id),
    ensureStopsForSession(row.afternoon?.session_id)
  ]);
}

async function load() {
  const params = { school_id: sid };
  if (filter.value.name) params.name = filter.value.name;
  if (filter.value.grade_id) params.grade_id = filter.value.grade_id;
  if (filter.value.class_id) params.class_id = filter.value.class_id;
  if (filter.value.session_id === -1) params.session_id = 'none';
  else if (filter.value.session_id) params.session_id = filter.value.session_id;

  const rows = await api.get('/ride-assign', { params });
  list.value = rows.map(normalizeRow);
  await Promise.all(list.value.map(warmRowStops));
}

function handleSessionChange(row, slotKey) {
  const slot = row[slotKey];
  slot.board_stop_id = null;
  slot.alight_stop_id = null;
  if (slot.session_id) ensureStopsForSession(slot.session_id);
}

async function saveRow(row) {
  await api.put(`/ride-assign/${row.id}`, {
    morning: row.morning,
    afternoon: row.afternoon
  });
  ElMessage.success('保存成功');
  await load();
}

async function clearRow(row) {
  row.morning = buildEmptySlot();
  row.afternoon = buildEmptySlot();
  await saveRow(row);
}

async function downloadFile(url, filename) {
  const response = await requestRaw({
    url,
    method: 'get',
    params: { school_id: sid },
    responseType: 'blob'
  });
  const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

async function exportCSV() {
  try {
    await downloadFile('/ride-assign/export', 'ride-assign.csv');
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '导出失败');
  }
}

async function downloadTemplate() {
  try {
    await downloadFile('/ride-assign/template', 'ride-assign-template.csv');
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '下载模板失败');
  }
}

async function downloadChangeTemplate() {
  try {
    await downloadFile('/ride-assign/change-template', 'ride-change-template.csv');
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '下载调班模板失败');
  }
}

async function handleImport(file) {
  try {
    const text = await file.text();
    const res = await api.post('/ride-assign/import', text, {
      params: { school_id: sid },
      headers: { 'Content-Type': 'text/plain' }
    });
    importResult.value = res;
    importResultDialog.value = true;
    if (!res.updated) {
      ElMessage.warning(res.errors?.length ? '没有成功更新任何数据，请检查导入结果' : '没有检测到数据变化');
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '导入失败');
  }
  return false;
}

async function handleChangeImport(file) {
  try {
    const text = await file.text();
    const res = await api.post('/ride-assign/change-import', text, {
      params: { school_id: sid },
      headers: { 'Content-Type': 'text/plain' }
    });
    importResult.value = res;
    importResultDialog.value = true;
    if (!res.updated) {
      ElMessage.warning(res.errors?.length ? '没有成功更新任何数据，请检查导入结果' : '没有检测到数据变化');
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '调班导入失败');
  }
  return false;
}

onMounted(async () => {
  [grades.value, classes.value, sessions.value] = await Promise.all([
    api.get('/grades', { params: { school_id: sid } }),
    api.get('/classes', { params: { school_id: sid } }),
    api.get('/sessions', { params: { school_id: sid } })
  ]);
  await load();
});
</script>
