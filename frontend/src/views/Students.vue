<template>
  <el-card>
    <template #header>
      <span>学生管理</span>
      <span style="float:right;display:flex;gap:8px;flex-wrap:wrap">
        <el-input v-model="search" placeholder="搜索姓名/家长电话" size="small" style="width:180px" clearable />
        <el-select v-model="filterGrade" clearable placeholder="年级" size="small" style="width:90px" @change="filterClass=null">
          <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
        <el-select v-model="filterClass" clearable placeholder="班级" size="small" style="width:90px">
          <el-option v-for="c in filteredClasses" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-button size="small" @click="exportCSV">导出</el-button>
        <el-button size="small" @click="downloadImportTemplate">下载导入模板</el-button>
        <el-upload :show-file-list="false" accept=".csv" :before-upload="importCSV">
          <el-button size="small">批量导入</el-button>
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
      <el-table-column prop="Grade.name" label="年级" width="80" />
      <el-table-column prop="Class.name" label="班级" width="70" />
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
      <el-table-column prop="face_id" label="人脸ID" width="100" />
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="del(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="visible" :title="form.id?'编辑学生':'新增学生'" width="520px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
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
        <el-form-item label="人脸ID"><el-input v-model="form.face_id" /></el-form-item>
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
      <template #footer>
        <el-button type="primary" @click="resultDialog=false;load()">确定</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '../api';
import { useSchoolStore } from '../stores/school';

const sid = useSchoolStore().current?.id;

const list     = ref([]);
const grades   = ref([]);
const classes  = ref([]);
const selected = ref([]);
const visible  = ref(false);
const form     = ref({ parents: [] });

const search      = ref('');
const filterGrade = ref(null);
const filterClass = ref(null);

// 批量调班级
const batchClassVisible = ref(false);
const batchGradeId      = ref(null);
const batchClassId      = ref(null);

// 通用结果弹窗
const resultDialog = ref(false);
const resultTitle  = ref('');
const resultMsg    = ref('');
const importResult = ref({});

const filteredClasses = computed(() =>
  filterGrade.value ? classes.value.filter(c => c.grade_id === filterGrade.value) : classes.value
);
const dialogClasses = computed(() =>
  form.value.grade_id ? classes.value.filter(c => c.grade_id === form.value.grade_id) : classes.value
);
const batchAvailableClasses = computed(() =>
  batchGradeId.value ? classes.value.filter(c => c.grade_id === batchGradeId.value) : classes.value
);
const filteredList = computed(() => {
  let l = list.value;
  if (search.value) {
    const q = search.value.toLowerCase();
    l = l.filter(s => s.name?.includes(q) || s.parent_phone?.includes(q) ||
      s.parents?.some(p => p.phone?.includes(q) || p.name?.includes(q)));
  }
  if (filterGrade.value) l = l.filter(s => s.grade_id === filterGrade.value);
  if (filterClass.value) l = l.filter(s => s.class_id === filterClass.value);
  return l;
});

async function load() {
  [list.value, grades.value, classes.value] = await Promise.all([
    api.get('/students', { params: { school_id: sid } }),
    api.get('/grades',   { params: { school_id: sid } }),
    api.get('/classes',  { params: { school_id: sid } })
  ]);
}

function openDialog(row = {}) {
  form.value = { school_id: sid, parents: [], ...row };
  if (!form.value.parents?.length && row.parent_phone) {
    form.value.parents = [{ name: row.parent_name || '', phone: row.parent_phone, relation: '家长' }];
  }
  visible.value = true;
}

async function save() {
  const data = { ...form.value };
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
function exportCSV() { window.open(`/api/students/export?school_id=${sid}`); }
function downloadImportTemplate() { window.open(`/api/students/import-template?school_id=${sid}`); }
function downloadClassChangeTemplate() { window.open(`/api/students/class-change-template?school_id=${sid}`); }

async function importCSV(file) {
  const text = await file.text();
  const res  = await api.post(`/students/import?school_id=${sid}`, text, {
    headers: { 'Content-Type': 'text/plain' }
  });
  resultTitle.value = '导入结果';
  resultMsg.value   = `成功新增 ${res.created} 名学生`;
  importResult.value = res;
  resultDialog.value = true;
  return false;
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
