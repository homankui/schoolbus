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
        <el-input v-model="search" placeholder="搜索姓名/卡号" size="small" style="width:180px" clearable @change="onFilterChange" />
        <el-select v-if="!isClassTeacher" v-model="filterGrade" clearable placeholder="年级" size="small" style="width:90px" @change="filterClass=null; onFilterChange()">
          <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
        <el-select v-if="!isClassTeacher" v-model="filterClass" clearable placeholder="班级" size="small" style="width:90px" @change="onFilterChange">
          <el-option v-for="c in filteredClasses" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-select v-model="filterFaceStatus" clearable placeholder="人脸状态" size="small" style="width:110px" @change="onFilterChange">
          <el-option label="待绑定" value="pending" />
          <el-option label="已绑定" value="bound" />
          <el-option label="未录入" value="empty" />
        </el-select>
        <el-button size="small" @click="filterFaceStatus='pending'; onFilterChange()">只看待绑定</el-button>
        <el-button size="small" @click="filterFaceStatus='empty'; onFilterChange()">只看未录入</el-button>
        <el-button size="small" :type="hasActiveFilters ? 'info' : 'default'" @click="resetFilters">清空筛选</el-button>
        <el-button v-if="!isClassTeacher" size="small" @click="exportPendingCSV" :disabled="faceStatusSummary.pending === 0">导出待绑定</el-button>
        <el-button size="small" type="warning" @click="clearPendingSelected" :disabled="!pendingSelectedCount">清空待绑定 ({{ pendingSelectedCount }})</el-button>
        <span style="font-size:12px;color:#909399;align-self:center">照片文件名请直接使用学生卡号</span>
        <el-button v-if="!isClassTeacher" size="small" @click="exportCSV">导出</el-button>
        <el-button v-if="!isClassTeacher" size="small" @click="downloadImportTemplate">下载导入模板</el-button>
        <el-upload v-if="!isClassTeacher" :show-file-list="false" accept=".csv" :before-upload="importCSV">
          <el-button size="small">批量导入</el-button>
        </el-upload>
        <el-upload
          ref="photoUploadRef"
          :show-file-list="false"
          multiple
          accept=".jpg,.jpeg,.png,.webp"
          :auto-upload="false"
          :on-change="handlePhotoFileChange"
          :on-remove="handlePhotoFileRemove"
          :on-exceed="handlePhotoExceed"
        >
          <el-button size="small">批量导入照片{{ photoFiles.length ? ` (${photoFiles.length})` : '' }}</el-button>
        </el-upload>
        <el-button size="small" type="primary" @click="submitPhotoImport" :disabled="photoFiles.length === 0">开始上传{{ photoFiles.length ? ` (${photoFiles.length})` : '' }}</el-button>
        <el-button v-if="photoFiles.length" size="small" @click="clearPhotoQueue">清空已选</el-button>
        <el-button
          v-if="!isClassTeacher"
          size="small"
          :disabled="!selected.length"
          @click="openBatchClassDialog"
        >批量调班级 ({{ selected.length }})</el-button>
        <el-button v-if="!isClassTeacher" size="small" @click="downloadClassChangeTemplate">下载调班级模板</el-button>
        <el-upload v-if="!isClassTeacher" :show-file-list="false" accept=".csv" :before-upload="importClassChange">
          <el-button size="small">导入调班级</el-button>
        </el-upload>
        <el-button v-if="!isClassTeacher" type="primary" size="small" @click="openDialog()">新增</el-button>
      </span>
    </template>

    <div style="width:100%;overflow-x:auto">
    <el-table :data="list" size="small" @selection-change="selected=$event" row-key="id">
      <el-table-column type="selection" width="45" />
      <el-table-column prop="name" label="姓名" width="90" />
      <el-table-column prop="card_no" label="学生卡号" width="130" />
      <el-table-column prop="Grade.name" label="年级" width="80" />
      <el-table-column prop="Class.name" label="班级" width="70" />
      <el-table-column label="默认站点" min-width="180">
        <template #default>
          <div style="font-size:12px;color:#909399">请在“搭乘管理”中分别维护上学/放学站点</div>
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
      <el-table-column label="人脸照片" width="110">
        <template #default="{ row }">
          <el-image
            v-if="row.face_photo_url"
            :src="resolveFacePhotoUrl(row.face_photo_url)"
            :preview-src-list="[resolveFacePhotoUrl(row.face_photo_url)]"
            fit="cover"
            style="width:48px;height:48px;border-radius:6px"
            preview-teleported
          />
          <span v-else style="font-size:12px;color:#999">暂无照片</span>
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
          <el-button v-if="!isClassTeacher" size="small" type="danger" @click="del(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-pagination
      style="margin-top:12px"
      v-model:current-page="page"
      :page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      @current-change="load"
      @size-change="onPageSizeChange"
    />

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="visible" :title="form.id?'编辑学生':'新增学生'" :width="isMobile ? '90%' : '520px'">
      <el-form :model="form" label-width="80px">
        <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="学生卡号"><el-input v-model="form.card_no" /></el-form-item>
        <el-form-item v-if="!isClassTeacher" label="年级">
          <el-select v-model="form.grade_id" clearable @change="form.class_id=null">
            <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!isClassTeacher" label="班级">
          <el-select v-model="form.class_id" clearable>
            <el-option v-for="c in dialogClasses" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="人脸ID">
          <el-input v-model="form.face_id" />
          <div style="margin-top:10px">
            <el-image
              v-if="form.face_photo_url"
              :src="resolveFacePhotoUrl(form.face_photo_url)"
              :preview-src-list="[resolveFacePhotoUrl(form.face_photo_url)]"
              fit="cover"
              style="width:96px;height:96px;border-radius:8px;border:1px solid #ebeef5"
              preview-teleported
            />
            <div v-else style="font-size:12px;color:#909399">当前暂无人脸照片</div>
          </div>
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
        <el-form-item v-if="!isClassTeacher" label="家长OpenID(测试)">
          <el-input
            v-model="form.parent_openid"
            placeholder="TEST_PARENT_OPENID_VISIBLE"
          />
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
        <el-button type="primary" native-type="button" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量调班级弹窗 -->
    <el-dialog v-model="batchClassVisible" title="批量调整班级" :width="isMobile ? '90%' : '440px'">
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
    <el-dialog v-model="resultDialog" :title="resultTitle" :width="isMobile ? '90%' : '480px'">
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
import { useAuthStore } from '../stores/auth';
import { useIsMobile } from '../composables/useIsMobile';

const { isMobile } = useIsMobile();
const schoolStore = useSchoolStore();
const authStore = useAuthStore();
const sid = computed(() => schoolStore.current?.id || Number(authStore.schoolId || 0) || null);
const isClassTeacher = computed(() => authStore.isClassTeacher);

const list     = ref([]);
const grades   = ref([]);
const classes  = ref([]);
const stops    = ref([]);
const selected = ref([]);
const visible  = ref(false);
const form     = ref({ parents: [] });

const page      = ref(1);
const pageSize  = ref(20);
const total     = ref(0);
const faceStats = ref({ pending: 0, bound: 0, empty: 0 });

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
const photoUploadRef = ref(null);

const filteredClasses = computed(() =>
  filterGrade.value ? classes.value.filter(c => c.grade_id === filterGrade.value) : classes.value
);
const dialogClasses = computed(() =>
  form.value.grade_id ? classes.value.filter(c => c.grade_id === form.value.grade_id) : classes.value
);
const batchAvailableClasses = computed(() =>
  batchGradeId.value ? classes.value.filter(c => c.grade_id === batchGradeId.value) : classes.value
);
const faceStatusSummary = computed(() => faceStats.value);
const hasActiveFilters = computed(() =>
  !!search.value || !!filterGrade.value || !!filterClass.value || !!filterFaceStatus.value
);
const pendingSelectedCount = computed(() =>
  selected.value.filter(item => item.face_import_status === 'pending').length
);

function stopOptionLabel(stop) {
  return stop?.Session?.name ? `${stop.name}（${stop.Session.name}）` : stop?.name || '';
}

function resolveFacePhotoUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`;
}

function resetFilters() {
  search.value = '';
  filterGrade.value = null;
  filterClass.value = null;
  filterFaceStatus.value = null;
  page.value = 1;
  load();
}

async function load() {
  const schoolId = sid.value;
  const params = {
    school_id: schoolId || undefined,
    search: search.value || undefined,
    grade_id: filterGrade.value || undefined,
    class_id: filterClass.value || undefined,
    face_status: filterFaceStatus.value || undefined,
    page: page.value,
    pageSize: pageSize.value
  };
  const res = await api.get('/students', { params });
  list.value = res.data || [];
  total.value = res.total || 0;
  faceStats.value = res.stats || { pending: 0, bound: 0, empty: 0 };

  [grades.value, classes.value, stops.value] = await Promise.all([
    api.get('/grades',  { params: { school_id: schoolId || undefined } }),
    api.get('/classes', { params: { school_id: schoolId || undefined } }),
    api.get('/stops',   { params: { school_id: schoolId || undefined } })
  ]);
}

function onFilterChange() {
  page.value = 1;
  load();
}

function onPageSizeChange() {
  page.value = 1;
  load();
}

function openDialog(row = {}) {
  form.value = {
    school_id: sid.value,
    parents: [],
    name: '',
    card_no: '',
    parent_openid: '',
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
  // 深拷贝，彻底去除 Vue 响应式代理，避免数据序列化问题
  const data = JSON.parse(JSON.stringify(form.value));
  data.name = (data.name || '').trim();
  if (!data.name) {
    ElMessage.warning('请填写学生姓名');
    return;
  }
  data.card_no = (data.card_no || '').trim();
  if (!data.card_no) {
    ElMessage.warning('请填写学生卡号');
    return;
  }
  if (Array.isArray(data.parents) && data.parents.length) {
    data.parent_phone = data.parents[0].phone || '';
    data.parent_name  = data.parents[0].name || '';
  }
  if (isClassTeacher.value) {
    delete data.grade_id;
    delete data.class_id;
    delete data.school_id;
    delete data.parent_openid;
  }
  try {
    if (data.id) {
      await api.put(`/students/${data.id}`, data);
    } else {
      await api.post('/students', data);
    }
    visible.value = false;
    ElMessage.success('保存成功');
    load();
  } catch (e) {
    console.error('保存学生失败', e);
    const msg = e?.response?.data?.message || e?.message || '保存失败，请重试';
    ElMessage.error(msg);
  }
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
  const schoolId = sid.value;
  const res  = await api.post(`/students/import?school_id=${schoolId || ''}`, text, {
    headers: { 'Content-Type': 'text/plain' }
  });
  resultTitle.value = '导入结果';
  resultMsg.value   = `成功新增 ${res.created} 名学生（站点请在搭乘管理中导入，人脸ID可留空）`;
  importResult.value = res;
  resultDialog.value = true;
  return false;
}

function handlePhotoFileChange(uploadFile, uploadFiles) {
  photoFiles.value = uploadFiles
    .map(item => item.raw)
    .filter(Boolean);
}

function handlePhotoFileRemove(uploadFile, uploadFiles) {
  photoFiles.value = uploadFiles
    .map(item => item.raw)
    .filter(Boolean);
}

function clearPhotoQueue() {
  photoFiles.value = [];
  photoUploadRef.value?.clearFiles?.();
}

function handlePhotoExceed(files) {
  if (!files?.length) return;
  photoFiles.value = files;
}

async function submitPhotoImport() {
  if (!photoFiles.value.length) {
    ElMessage.warning('请先选择照片文件');
    return;
  }

  const formData = new FormData();
  photoFiles.value.forEach(file => formData.append('photos', file));

  try {
    const schoolId = sid.value;
    const res = await api.post(`/students/photo-import?school_id=${schoolId || ''}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    resultTitle.value = '照片导入结果';
    resultMsg.value = `成功写入 ${res.updated || 0} 张待绑定照片，跳过 ${res.skipped || 0} 张已有正式人脸的学生照片`;
    importResult.value = res;
    resultDialog.value = true;
    clearPhotoQueue();
    await load();
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

onMounted(async () => {
  if (isClassTeacher.value) {
    filterGrade.value = Number(authStore.gradeId || 0) || null;
    filterClass.value = Number(authStore.classId || 0) || null;
  }
  await load();
});
</script>
