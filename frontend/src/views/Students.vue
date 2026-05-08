<template>
  <el-card>
    <template #header>
      <span>学生管理</span>
      <el-tag v-if="faceStatusSummary.pending > 0" type="warning" effect="dark" style="margin-left:12px">
        还有 {{ faceStatusSummary.pending }} 名待绑定
      </el-tag>
      <el-tag v-else type="success" effect="plain" style="margin-left:12px">
        人脸绑定已处理完成
      </el-tag>
      <span style="margin-left:12px;font-size:12px;color:#909399">
        待绑定 {{ faceStatusSummary.pending }} / 已绑定 {{ faceStatusSummary.bound }} / 未录入 {{ faceStatusSummary.empty }}
      </span>
      <span style="float:right;display:flex;gap:8px;flex-wrap:wrap">
        <el-input v-model="search" placeholder="搜索姓名/家长电话" size="small" style="width:180px" clearable />
        <el-select v-model="filterGrade" clearable placeholder="年级" size="small" style="width:90px" @change="filterClass=null">
          <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
        <el-select v-model="filterClass" clearable placeholder="班级" size="small" style="width:90px">
          <el-option v-for="c in filteredClasses" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-select v-model="filterFaceStatus" clearable placeholder="人脸状态" size="small" style="width:110px">
          <el-option label="待绑定" value="pending" />
          <el-option label="已绑定" value="bound" />
          <el-option label="未录入" value="empty" />
        </el-select>
        <el-button size="small" :type="filterFaceStatus === 'pending' ? 'primary' : 'default'" @click="filterFaceStatus='pending'">只看待绑定</el-button>
        <el-button size="small" :type="filterFaceStatus === 'empty' ? 'primary' : 'default'" @click="filterFaceStatus='empty'">只看未录入</el-button>
        <el-button size="small" :type="hasActiveFilters ? 'info' : 'default'" @click="resetFilters">清空筛选</el-button>
        <el-button size="small" @click="exportPendingCSV" :disabled="faceStatusSummary.pending === 0">导出待绑定</el-button>
        <el-button size="small" type="warning" @click="clearPendingSelected" :disabled="!pendingSelectedCount">清空待绑定 ({{ pendingSelectedCount }})</el-button>
        <span style="font-size:12px;color:#909399;align-self:center">照片文件名请直接使用学生卡号</span>
        <el-button size="small" @click="exportCSV">导出</el-button>
        <el-button size="small" @click="downloadImportTemplate">下载导入模板</el-button>
        <el-upload :show-file-list="false" accept=".csv" :before-upload="importCSV">
          <el-button size="small">批量导入</el-button>
        </el-upload>
        <el-upload :show-file-list="false" multiple accept=".jpg,.jpeg,.png,.webp" :before-upload="queuePhotoFile" :auto-upload="false">
          <el-button size="small" @click="submitPhotoImport" :disabled="photoFiles.length === 0">批量导入照片{{ photoFiles.length ? ` (${photoFiles.length})` : '' }}</el-button>
        </el-upload>
        <el-button
          size="small"
          :disabled="!selected.length"
          @click="openBatchClassDialog"
        >批量调班级 ({{ selected.length }})</el-button>
        <el-button size="small" @click="downloadClassChangeTemplate">下载调班级模板</el-button>
        <el-upload :show-file-list="false" accept=".csv" :before-upload="importClassChange">
          <el-button size="small">导入调班级</el-button>
        </el-upload>
        <el-button type="primary" size="small" @click="openDialog()">新增</el-button>
      </span>
    </template>

    <el-table :data="filteredList" size="small" @selection-change="selected=$event" row-key="id">
      <el-table-column type="selection" width="45" />
      <el-table-column prop="name" label="姓名" width="90" />
      <el-table-column prop="card_no" label="学生卡号" width="130" />
      <el-table-column prop="Grade.name" label="年级" width="80" />
      <el-table-column prop="Class.name" label="班级" width="70" />
      <el-table-column label="默认站点" min-width="180">
        <template #default="{ row }">
          <div style="font-size:12px">上车：{{ row.BoardStop?.name || '-' }}</div>
          <div style="font-size:12px">下车：{{ row.AlightStop?.name || '-' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="家长信息">
        <template #default="{ row }">
          <div v-for="(p, i) in row.parents" :key="i" style="font-size:12px">
            {{ p.name }} {{ p.phone }}
          </div>
          <div v-if="!row.parents?.length" style="font-size:12px;color:#999">
            {{ row.parent_name }} {{ row.parent_phone }}
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="face_id" label="人脸状态" width="220">
        <template #default="{ row }">
          <div>{{ row.face_id || '-' }}</div>
          <el-tag v-if="row.face_import_status === 'pending'" size="small" type="warning">待正式绑定</el-tag>
          <el-tag v-else-if="row.face_id" size="small" type="success">已绑定</el-tag>
          <el-tag v-else size="small" type="info">未录入</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button v-if="row.face_import_status === 'pending'" size="small" type="warning" @click="clearPendingOne(row)">清空待绑定</el-button>
          <el-button size="small" type="danger" @click="del(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="visible" :title="form.id?'编辑学生':'新增学生'" width="520px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="学生卡号"><el-input v-model="form.card_no" /></el-form-item>
        <el-form-item label="年级">
          <el-select v-model="form.grade_id" clearable @change="form.class_id=null">
            <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="班级">
          <el-select v-model="form.class_id" clearable>
            <el-option v-for="c in dialogClasses" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="上车站点">
          <el-select v-model="form.board_stop_id" clearable filterable style="width:100%">
            <el-option v-for="stop in stops" :key="stop.id" :label="stopOptionLabel(stop)" :value="stop.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="下车站点">
          <el-select v-model="form.alight_stop_id" clearable filterable style="width:100%">
            <el-option v-for="stop in stops" :key="stop.id" :label="stopOptionLabel(stop)" :value="stop.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="人脸ID">
          <el-input v-model="form.face_id" />
          <div style="font-size:12px;color:#909399;margin-top:6px">
            <template v-if="form.face_import_status === 'pending'">
              当前为照片待绑定状态，终端采集成功后会自动升级为正式人脸ID。
            </template>
            <template v-else-if="form.face_id">
              当前已有人脸ID，可直接保留或手动修改。
            </template>
            <template v-else>
              当前未录入人脸，可通过终端采集或“按学生卡号+照片文件”批量导入。
            </template>
          </div>
          <div v-if="form.face_import_status === 'pending'" style="margin-top:8px">
            <el-button size="small" type="warning" @click="clearPendingInDialog">清空当前待绑定</el-button>
          </div>
        </el-form-item>
        <el-divider>家长信息</el-divider>
        <div v-for="(p, i) in form.parents" :key="i" style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
          <el-input v-model="p.name" placeholder="家长姓名" style="width:120px" />
          <el-input v-model="p.phone" placeholder="手机号" style="width:140px" />
          <el-input v-model="p.relation" placeholder="关系" style="width:80px" />
          <el-button type="danger" link @click="form.parents.splice(i,1)">删除</el-button>
        </div>
        <el-button type="primary" link @click="form.parents.push({name:'',phone:'',relation:''})">+ 添加家长</el-button>
      </el-form>
      <template #footer>
        <el-button @click="visible=false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量调班级弹窗 -->
    <el-dialog v-model="batchClassVisible" title="批量调整班级" width="440px">
      <div style="color:#666;margin-bottom:16px">
        已选 <b>{{ selected.length }}</b> 名学生，统一调整到：
      </div>
      <el-form label-width="80px">
        <el-form-item label="目标年级">
          <el-select v-model="batchGradeId" clearable placeholder="选择年级" style="width:100%" @change="batchClassId=null">
            <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标班级">
          <el-select v-model="batchClassId" clearable placeholder="选择班级（可不选）" style="width:100%">
            <el-option v-for="c in batchAvailableClasses" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <div style="color:#999;font-size:12px;margin-top:-8px">
        留空班级表示只调整年级，不改变班级
      </div>
      <template #footer>
        <el-button @click="batchClassVisible=false">取消</el-button>
        <el-button type="primary" :disabled="!batchGradeId" @click="doBatchClass">确认调整</el-button>
      </template>
    </el-dialog>

    <!-- 导入结果弹窗（通用） -->
    <el-dialog v-model="resultDialog" :title="resultTitle" width="480px">
      <el-alert
        :title="resultMsg"
        :type="importResult.errors?.length ? 'warning' : 'success'"
        :closable="false"
        style="margin-bottom:10px"
      />
      <div v-if="importResult.errors?.length">
        <div style="color:#e6a23c;font-weight:bold;margin-bottom:6px">以下行有问题：</div>
        <div v-for="e in importResult.errors" :key="e" style="font-size:13px;color:#f56c6c">{{ e }}</div>
      </div>
      <div v-if="importResult.results?.length" style="margin-top:10px">
        <div style="color:#67c23a;font-weight:bold;margin-bottom:6px">处理结果：</div>
        <div v-for="item in importResult.results" :key="`${item.filename}-${item.card_no}`" style="font-size:13px;color:#606266">
          {{ item.filename }} → {{ item.student_name }}（{{ item.card_no }}） - {{ item.message || '处理成功' }}
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="resultDialog=false;load()">确定</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api, { requestRaw } from '../api';
import { useSchoolStore } from '../stores/school';

const sid = useSchoolStore().current?.id;

const list     = ref([]);
const grades   = ref([]);
const classes  = ref([]);
const stops    = ref([]);
const selected = ref([]);
const visible  = ref(false);
const form     = ref({ parents: [] });

const search      = ref('');
const filterGrade = ref(null);
const filterClass = ref(null);
const filterFaceStatus = ref(null);

// 批量调班级
const batchClassVisible = ref(false);
const batchGradeId      = ref(null);
const batchClassId      = ref(null);

// 通用结果弹窗
const resultDialog = ref(false);
const resultTitle  = ref('');
const resultMsg    = ref('');
const importResult = ref({});
const photoFiles   = ref([]);

const filteredClasses = computed(() =>
  filterGrade.value ? classes.value.filter(c => c.grade_id === filterGrade.value) : classes.value
);
const dialogClasses = computed(() =>
  form.value.grade_id ? classes.value.filter(c => c.grade_id === form.value.grade_id) : classes.value
);
const batchAvailableClasses = computed(() =>
  batchGradeId.value ? classes.value.filter(c => c.grade_id === batchGradeId.value) : classes.value
);
const faceStatusSummary = computed(() => ({
  pending: list.value.filter(s => s.face_import_status === 'pending').length,
  bound: list.value.filter(s => s.face_import_status !== 'pending' && !!s.face_id).length,
  empty: list.value.filter(s => !s.face_id).length
}));
const hasActiveFilters = computed(() =>
  !!search.value || !!filterGrade.value || !!filterClass.value || !!filterFaceStatus.value
);
const pendingSelectedCount = computed(() =>
  selected.value.filter(item => item.face_import_status === 'pending').length
);
const filteredList = computed(() => {
  let l = list.value;
  if (search.value) {
    const q = search.value.toLowerCase();
    l = l.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.card_no?.toLowerCase().includes(q) ||
      s.parent_phone?.includes(q) ||
      s.parents?.some(p => p.phone?.includes(q) || p.name?.includes(q))
    );
  }
  if (filterGrade.value) l = l.filter(s => s.grade_id === filterGrade.value);
  if (filterClass.value) l = l.filter(s => s.class_id === filterClass.value);
  if (filterFaceStatus.value === 'pending') {
    l = l.filter(s => s.face_import_status === 'pending');
  } else if (filterFaceStatus.value === 'bound') {
    l = l.filter(s => s.face_import_status !== 'pending' && !!s.face_id);
  } else if (filterFaceStatus.value === 'empty') {
    l = l.filter(s => !s.face_id);
  }
  return l;
});

function stopOptionLabel(stop) {
  return stop?.Session?.name ? `${stop.name}（${stop.Session.name}）` : stop?.name || '';
}

function resetFilters() {
  search.value = '';
  filterGrade.value = null;
  filterClass.value = null;
  filterFaceStatus.value = null;
}

async function load() {
  [list.value, grades.value, classes.value, stops.value] = await Promise.all([
    api.get('/students', { params: { school_id: sid } }),
    api.get('/grades',   { params: { school_id: sid } }),
    api.get('/classes',  { params: { school_id: sid } }),
    api.get('/stops',    { params: { school_id: sid } })
  ]);
}

function openDialog(row = {}) {
  form.value = {
    school_id: sid,
    parents: [],
    card_no: '',
    board_stop_id: null,
    alight_stop_id: null,
    ...row
  };
  if (!form.value.parents?.length && row.parent_phone) {
    form.value.parents = [{ name: row.parent_name || '', phone: row.parent_phone, relation: '家长' }];
  }
  visible.value = true;
}

async function save() {
  const data = { ...form.value };
  data.card_no = data.card_no?.trim?.() || '';
  if (!data.card_no) {
    ElMessage.warning('请填写学生卡号');
    return;
  }
  if (data.parents?.length) {
    data.parent_phone = data.parents[0].phone;
    data.parent_name  = data.parents[0].name;
  }
  if (data.id) await api.put(`/students/${data.id}`, data);
  else await api.post('/students', data);
  visible.value = false;
  ElMessage.success('保存成功');
  load();
}

async function del(id) {
  await ElMessageBox.confirm('确认删除？');
  await api.delete(`/students/${id}`);
  ElMessage.success('删除成功');
  load();
}

// ── 批量调班级（弹窗操作）────────────────────────────────
function openBatchClassDialog() {
  batchGradeId.value = null;
  batchClassId.value = null;
  batchClassVisible.value = true;
}

async function doBatchClass() {
  const ids = selected.value.map(s => s.id);
  await api.post('/students/batch-class', {
    student_ids: ids,
    grade_id: batchGradeId.value,
    class_id: batchClassId.value || null
  });
  batchClassVisible.value = false;
  ElMessage.success(`已调整 ${ids.length} 名学生`);
  load();
}

// ── 导出 / 模板 / 导入 ───────────────────────────────────
async function clearPendingOne(row) {
  await ElMessageBox.confirm(`确认清空 ${row.name} 的待绑定照片状态？`);
  const res = await api.post('/students/clear-pending-face', {
    student_ids: [row.id]
  });
  ElMessage.success(`已清空 ${res.cleared || 0} 名学生的待绑定状态`);
  if (form.value?.id === row.id) {
    form.value.face_id = '';
    form.value.face_import_status = '';
    form.value.face_import_source = '';
  }
  load();
}

async function clearPendingInDialog() {
  if (!form.value?.id) return;
  await clearPendingOne({
    id: form.value.id,
    name: form.value.name || '当前学生'
  });
}

async function clearPendingSelected() {
  const ids = selected.value
    .filter(item => item.face_import_status === 'pending')
    .map(item => item.id);

  if (!ids.length) {
    ElMessage.warning('请先选择待绑定学生');
    return;
  }

  await ElMessageBox.confirm(`确认批量清空 ${ids.length} 名学生的待绑定照片状态？`);
  const res = await api.post('/students/clear-pending-face', {
    student_ids: ids
  });
  ElMessage.success(`已清空 ${res.cleared || 0} 名学生的待绑定状态`);
  load();
}

function exportCSV() {
  return downloadFile('/students/export', 'students.csv');
}

function exportPendingCSV() {
  const pendingRows = filteredList.value.filter(s => s.face_import_status === 'pending');
  if (!pendingRows.length) {
    ElMessage.warning('当前没有待绑定学生可导出');
    return;
  }

  const scopeParts = [];
  const filenameParts = ['students-pending-face'];
  if (filterGrade.value) {
    const grade = grades.value.find(item => item.id === filterGrade.value);
    if (grade?.name) {
      scopeParts.push(`年级：${grade.name}`);
      filenameParts.push(`grade-${sanitizeFilenamePart(grade.name)}`);
    }
  }
  if (filterClass.value) {
    const cls = classes.value.find(item => item.id === filterClass.value);
    if (cls?.name) {
      scopeParts.push(`班级：${cls.name}`);
      filenameParts.push(`class-${sanitizeFilenamePart(cls.name)}`);
    }
  }
  if (search.value) {
    scopeParts.push(`搜索：${search.value}`);
    filenameParts.push(`search-${sanitizeFilenamePart(search.value)}`);
  }

  const header = ['姓名', '学生卡号', '年级', '班级', '家长电话', '家长姓名', '人脸状态'];
  const lines = pendingRows.map(row => [
    row.name || '',
    row.card_no || '',
    row.gradeName || row.Grade?.name || '',
    row.className || row.Class?.name || '',
    row.parent_phone || '',
    row.parent_name || '',
    '待绑定'
  ].map(value => `"${String(value).replace(/"/g, '""')}"`).join(','));
  const comment = scopeParts.length ? `# 当前导出范围：${scopeParts.join('；')}\n` : '';
  const csv = '\uFEFF' + comment + [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${filenameParts.join('-')}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

  ElMessage.success(scopeParts.length
    ? `已导出当前筛选范围内的待绑定学生（${scopeParts.join('，')}）`
    : '已导出全部待绑定学生');
}

function sanitizeFilenamePart(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'all';
}

async function downloadFile(url, defaultFilename) {
  try {
    const response = await requestRaw({
      url,
      params: { school_id: sid },
      responseType: 'blob'
    });
    const disposition = response.headers?.['content-disposition'] || '';
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
    const filename = utf8Match
      ? decodeURIComponent(utf8Match[1])
      : (plainMatch?.[1] || defaultFilename);
    const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '下载失败');
  }
}

function downloadImportTemplate() {
  return downloadFile('/students/import-template', 'students-template.csv');
}

function downloadClassChangeTemplate() {
  return downloadFile('/students/class-change-template', 'students-class-change-template.csv');
}

async function importCSV(file) {
  const text = await file.text();
  const res  = await api.post(`/students/import?school_id=${sid}`, text, {
    headers: { 'Content-Type': 'text/plain' }
  });
  resultTitle.value = '导入结果';
  resultMsg.value   = `成功新增 ${res.created} 名学生（站点请在搭乘管理中导入，人脸ID可留空）`;
  importResult.value = res;
  resultDialog.value = true;
  return false;
}

function queuePhotoFile(file) {
  photoFiles.value = [...photoFiles.value, file];
  return false;
}

async function submitPhotoImport() {
  if (!photoFiles.value.length) {
    ElMessage.warning('请先选择照片文件');
    return;
  }

  const formData = new FormData();
  photoFiles.value.forEach(file => formData.append('photos', file));

  try {
    const res = await api.post(`/students/photo-import?school_id=${sid}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    resultTitle.value = '照片导入结果';
    resultMsg.value = `成功写入 ${res.updated || 0} 张待绑定照片，跳过 ${res.skipped || 0} 张已有正式人脸的学生照片`;
    importResult.value = res;
    resultDialog.value = true;
    photoFiles.value = [];
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '照片导入失败');
  }
}

async function importClassChange(file) {
  const text = await file.text();
  const res  = await api.post('/students/class-change-import', text, {
    headers: { 'Content-Type': 'text/plain' }
  });
  resultTitle.value  = '调班级导入结果';
  resultMsg.value    = `成功更新 ${res.updated} 名学生`;
  importResult.value = res;
  resultDialog.value = true;
  return false;
}

onMounted(load);
</script>
