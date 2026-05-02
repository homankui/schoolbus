<template>
  <el-card>
    <template #header>
      <span>搭乘管理</span>
      <span style="float:right;display:flex;gap:8px">
        <el-button size="small" @click="downloadTemplate">下载导入模板</el-button>
        <el-button size="small" @click="downloadChangeTemplate">下载调班模板</el-button>
        <el-upload :show-file-list="false" accept=".csv" :before-upload="handleImport">
          <el-button size="small">批量导入</el-button>
        </el-upload>
        <el-button size="small" @click="exportCSV">导出</el-button>
        <el-button type="primary" size="small" :disabled="!selected.length" @click="batchDialog=true">
          批量操作 ({{ selected.length }})
        </el-button>
      </span>
    </template>

    <!-- 筛选栏 -->
    <el-row :gutter="10" style="margin-bottom:14px">
      <el-col :span="5">
        <el-input v-model="filter.name" placeholder="搜索姓名" clearable @input="load" />
      </el-col>
      <el-col :span="4">
        <el-select v-model="filter.grade_id" clearable placeholder="年级" @change="filter.class_id=null;load()">
          <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-col>
      <el-col :span="4">
        <el-select v-model="filter.class_id" clearable placeholder="班级" @change="load">
          <el-option v-for="c in filteredClasses" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-col>
      <el-col :span="5">
        <el-select v-model="filter.session_id" clearable placeholder="按班次筛选" @change="load">
          <el-option label="未分配任何班次" :value="-1" />
          <el-option v-for="s in sessions" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
      </el-col>
    </el-row>

    <el-table :data="list" @selection-change="selected=$event" row-key="id">
      <el-table-column type="selection" width="45" />
      <el-table-column prop="name" label="姓名" width="90" />
      <el-table-column prop="Grade.name" label="年级" width="80" />
      <el-table-column prop="Class.name" label="班级" width="70" />
      <el-table-column label="已绑定班次" min-width="200">
        <template #default="{ row }">
          <el-tag
            v-for="s in row.Sessions" :key="s.id"
            :type="s.type==='morning'?'warning':'success'"
            size="small" style="margin-right:4px;margin-bottom:2px" closable
            @close="removeSession(row, s.id)"
          >{{ s.name }}</el-tag>
          <el-tag v-if="!row.Sessions?.length" type="info" size="small">未分配</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="添加班次" width="200">
        <template #default="{ row }">
          <el-select
            placeholder="选择班次添加"
            size="small"
            style="width:170px"
            @change="val => addSession(row, val)"
          >
            <el-option
              v-for="s in availableSessions(row)"
              :key="s.id" :label="s.name" :value="s.id"
            />
          </el-select>
        </template>
      </el-table-column>
    </el-table>

    <!-- 批量操作弹窗 -->
    <el-dialog v-model="batchDialog" title="批量操作班次" width="420px">
      <div style="color:#666;margin-bottom:16px">已选 <b>{{ selected.length }}</b> 名学生</div>
      <el-tabs v-model="batchTab">
        <el-tab-pane label="追加班次" name="add">
          <div style="margin-top:12px">
            <el-select v-model="batchSessionId" placeholder="选择要追加的班次" style="width:100%">
              <el-option v-for="s in sessions" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
          </div>
        </el-tab-pane>
        <el-tab-pane label="移除班次" name="remove">
          <div style="margin-top:12px">
            <el-select v-model="batchSessionId" placeholder="选择要移除的班次" style="width:100%">
              <el-option v-for="s in sessions" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
          </div>
        </el-tab-pane>
        <el-tab-pane label="覆盖设置" name="set">
          <div style="margin-top:12px">
            <el-select v-model="batchSessionIds" multiple placeholder="选择班次（留空=清空所有）" style="width:100%">
              <el-option v-for="s in sessions" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
          </div>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="batchDialog=false">取消</el-button>
        <el-button type="primary" @click="doBatch">确认</el-button>
      </template>
    </el-dialog>

    <!-- 导入结果弹窗 -->
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
import api from '../api';
import { useSchoolStore } from '../stores/school';

const sid = useSchoolStore().current?.id;

const list     = ref([]);
const grades   = ref([]);
const classes  = ref([]);
const sessions = ref([]);
const selected = ref([]);

const batchDialog      = ref(false);
const batchTab         = ref('add');
const batchSessionId   = ref(null);
const batchSessionIds  = ref([]);
const importResultDialog = ref(false);
const importResult     = ref({});

const filter = ref({ name: '', grade_id: null, class_id: null, session_id: null });

const filteredClasses = computed(() =>
  filter.value.grade_id ? classes.value.filter(c => c.grade_id === filter.value.grade_id) : classes.value
);

function availableSessions(row) {
  const bound = row.Sessions?.map(s => s.id) || [];
  return sessions.value.filter(s => !bound.includes(s.id));
}

async function load() {
  const params = { school_id: sid };
  if (filter.value.name)     params.name     = filter.value.name;
  if (filter.value.grade_id) params.grade_id = filter.value.grade_id;
  if (filter.value.class_id) params.class_id = filter.value.class_id;
  if (filter.value.session_id === -1)   params.session_id = 'none';
  else if (filter.value.session_id)     params.session_id = filter.value.session_id;
  list.value = await api.get('/ride-assign', { params });
}

async function addSession(row, sessionId) {
  const newIds = [...(row.session_ids || []), sessionId];
  await api.put(`/ride-assign/${row.id}`, { session_ids: newIds });
  row.session_ids = newIds;
  row.Sessions = newIds.map(id => sessions.value.find(s => s.id === id)).filter(Boolean);
  ElMessage.success('已添加');
}

async function removeSession(row, sessionId) {
  const newIds = (row.session_ids || []).filter(id => id !== sessionId);
  await api.put(`/ride-assign/${row.id}`, { session_ids: newIds });
  row.session_ids = newIds;
  row.Sessions = newIds.map(id => sessions.value.find(s => s.id === id)).filter(Boolean);
  ElMessage.success('已移除');
}

async function doBatch() {
  const ids = selected.value.map(s => s.id);
  if (batchTab.value === 'add') {
    if (!batchSessionId.value) return ElMessage.warning('请选择班次');
    await api.post('/ride-assign/batch-add', { student_ids: ids, session_id: batchSessionId.value });
  } else if (batchTab.value === 'remove') {
    if (!batchSessionId.value) return ElMessage.warning('请选择班次');
    await api.post('/ride-assign/batch-remove', { student_ids: ids, session_id: batchSessionId.value });
  } else {
    await api.post('/ride-assign/batch-set', { student_ids: ids, session_ids: batchSessionIds.value });
  }
  batchDialog.value = false;
  batchSessionId.value = null;
  batchSessionIds.value = [];
  ElMessage.success('批量操作成功');
  load();
}

function exportCSV() { window.open(`/api/ride-assign/export?school_id=${sid}`); }
function downloadTemplate() { window.open(`/api/ride-assign/template?school_id=${sid}`); }
function downloadChangeTemplate() { window.open(`/api/ride-assign/change-template?school_id=${sid}`); }

async function handleImport(file) {
  const text = await file.text();
  const res = await api.post('/ride-assign/import', text, { headers: { 'Content-Type': 'text/plain' } });
  importResult.value = res;
  importResultDialog.value = true;
  return false;
}

onMounted(async () => {
  [grades.value, classes.value, sessions.value] = await Promise.all([
    api.get('/grades',   { params: { school_id: sid } }),
    api.get('/classes',  { params: { school_id: sid } }),
    api.get('/sessions', { params: { school_id: sid } })
  ]);
  load();
});
</script>
