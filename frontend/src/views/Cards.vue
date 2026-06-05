<template>
  <el-card>
    <template #header>
      <span>卡片管理</span>
      <span style="float:right;display:flex;gap:8px;flex-wrap:wrap">
        <el-button type="primary" size="small" @click="showGenerateDialog = true">批量生成</el-button>
      </span>
    </template>

    <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <el-select v-model="filterSchool" clearable placeholder="学校" size="small" style="width:140px" @change="onFilterChange">
        <el-option v-for="s in schools" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-select v-model="filterStatus" clearable placeholder="状态" size="small" style="width:100px" @change="onFilterChange">
        <el-option label="未分配" value="unassigned" />
        <el-option label="已分配" value="assigned" />
      </el-select>
      <el-input v-model="search" placeholder="搜索卡号" size="small" style="width:180px" clearable @change="onFilterChange" />
      <el-button size="small" @click="resetFilters">清空筛选</el-button>
    </div>

    <div style="width:100%;overflow-x:auto">
    <el-table :data="list" size="small" v-loading="loading">
      <el-table-column prop="card_no" label="卡号" width="160" />
      <el-table-column label="学校" width="140">
        <template #default="{ row }">{{ schoolMap[row.school_id]?.name || '-' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'assigned' ? 'success' : 'info'" size="small">
            {{ row.status === 'assigned' ? '已分配' : '未分配' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="关联学生" min-width="120">
        <template #default="{ row }">
          <span v-if="row.student">{{ row.student.name }}</span>
          <span v-else style="color:#999">-</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">{{ fmtDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'assigned'"
            size="small" type="warning"
            @click="freeCard(row)"
          >释放</el-button>
          <el-button
            v-if="row.status === 'unassigned'"
            size="small" type="danger"
            @click="delCard(row.id)"
          >删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-pagination
      style="margin-top:12px"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      @current-change="load"
      @size-change="onPageSizeChange"
    />

    <!-- 批量生成对话框 -->
    <el-dialog v-model="showGenerateDialog" title="批量生成卡片" :width="isMobile ? '90%' : '440px'">
      <el-form label-width="80px">
        <el-form-item label="学校">
          <el-select v-model="generateForm.school_id" placeholder="选择学校" style="width:100%">
            <el-option v-for="s in schools" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="卡号前缀">
          <el-input v-model="generateForm.prefix" placeholder="如：SC" />
        </el-form-item>
        <el-form-item label="起始编号">
          <el-input v-model.number="generateForm.start" placeholder="如：1" />
        </el-form-item>
        <el-form-item label="生成数量">
          <el-input v-model.number="generateForm.count" placeholder="如：10" />
        </el-form-item>
        <el-form-item label="预览">
          <span style="color:#409EFF;font-size:13px">{{ cardPreview }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGenerateDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!canGenerate" @click="doGenerate">生成</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '../api';
import { useIsMobile } from '../composables/useIsMobile';

const { isMobile } = useIsMobile();

const list = ref([]);
const schools = ref([]);
const total = ref(0);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const search = ref('');
const filterSchool = ref(null);
const filterStatus = ref(null);
const showGenerateDialog = ref(false);

const generateForm = ref({
  school_id: null,
  prefix: '',
  start: 1,
  count: 10
});

const schoolMap = computed(() => {
  const map = {};
  schools.value.forEach(s => { map[s.id] = s; });
  return map;
});

const cardPreview = computed(() => {
  const { prefix, start, count } = generateForm.value;
  const startNum = Number(start) || 1;
  const countNum = Number(count) || 1;
  const endNum = startNum + countNum - 1;
  const width = String(endNum).length;
  const first = prefix + String(startNum).padStart(width, '0');
  const last = prefix + String(endNum).padStart(width, '0');
  return first && last ? `${first}  ~  ${last}` : '-';
});

const canGenerate = computed(() =>
  generateForm.value.school_id &&
  Number(generateForm.value.start) >= 0 &&
  Number(generateForm.value.count) > 0 &&
  Number(generateForm.value.count) <= 1000
);

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('zh-CN');
}

async function loadSchools() {
  try {
    schools.value = await api.get('/schools');
  } catch {}
}

async function load() {
  loading.value = true;
  try {
    const params = {
      school_id: filterSchool.value || undefined,
      status: filterStatus.value || undefined,
      search: search.value || undefined,
      page: page.value,
      pageSize: pageSize.value
    };
    const res = await api.get('/cards', { params });
    list.value = res.list || [];
    total.value = res.total || 0;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

function onFilterChange() {
  page.value = 1;
  load();
}

function onPageSizeChange() {
  page.value = 1;
  load();
}

function resetFilters() {
  search.value = '';
  filterSchool.value = null;
  filterStatus.value = null;
  page.value = 1;
  load();
}

async function doGenerate() {
  try {
    const res = await api.post('/cards/generate', {
      prefix: generateForm.value.prefix,
      start: Number(generateForm.value.start),
      count: Number(generateForm.value.count),
      school_id: generateForm.value.school_id
    });
    showGenerateDialog.value = false;
    if (res.duplicates_skipped > 0) {
      ElMessage.warning(`已生成 ${res.generated} 张，${res.duplicates_skipped} 张因重复跳过`);
    } else {
      ElMessage.success(`成功生成 ${res.generated} 张卡片`);
    }
    load();
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '生成失败');
  }
}

async function freeCard(row) {
  try {
    const extra = row.student ? `（关联学生：${row.student.name}）` : '';
    await ElMessageBox.confirm(
      `确认释放卡片 ${row.card_no}${extra}？释放后该学生的卡号将被清空。`,
      '警告', { type: 'warning' }
    );
    await api.post(`/cards/${row.id}/free`);
    ElMessage.success('已释放');
    load();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '释放失败');
  }
}

async function delCard(id) {
  try {
    await ElMessageBox.confirm('确认删除该卡片？', '警告', { type: 'warning' });
    await api.delete(`/cards/${id}`);
    ElMessage.success('删除成功');
    load();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || '删除失败');
  }
}

onMounted(async () => {
  await loadSchools();
  await load();
});
</script>
