<template>
  <el-card>
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <span>请假记录</span>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <el-button v-if="authStore.isClassTeacher" type="primary" @click="openCreateDialog">代学生请假</el-button>
          <el-date-picker
            v-model="date"
            type="date"
            placeholder="按日期筛选"
            value-format="YYYY-MM-DD"
            style="width:160px"
            clearable
            @change="load"
          />
          <el-select
            v-model="status"
            placeholder="状态"
            clearable
            style="width:140px"
            @change="load"
          >
            <el-option label="全部状态" value="" />
            <el-option label="active" value="active" />
          </el-select>
          <el-input
            v-model="sessionName"
            placeholder="班次名称"
            clearable
            style="width:220px"
            @keyup.enter="load"
            @clear="load"
          />
          <el-input
            v-model="keyword"
            placeholder="学生/卡号/年级/班级"
            clearable
            style="width:220px"
            @keyup.enter="load"
            @clear="load"
          />
          <el-button type="primary" @click="load">查询</el-button>
        </div>
      </div>
    </template>

    <div style="width:100%;overflow-x:auto">
    <el-table :data="list">
      <el-table-column prop="student_name" label="学生" min-width="100" />
      <el-table-column prop="card_no" label="卡号" min-width="120" />
      <el-table-column label="年级班级" min-width="160">
        <template #default="{ row }">
          {{ [row.grade_name, row.class_name].filter(Boolean).join(' / ') || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="请假日期" min-width="120">
        <template #default="{ row }">{{ fmtDate(row.leave_date) }}</template>
      </el-table-column>
      <el-table-column prop="session_name" label="班次" min-width="180" show-overflow-tooltip />
      <el-table-column prop="reason" label="原因" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.reason || '无' }}</template>
      </el-table-column>
      <el-table-column label="状态" min-width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'warning' : 'info'">{{ row.status || '-' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="提交时间" min-width="180">
        <template #default="{ row }">{{ fmtDateTime(row.created_at) }}</template>
      </el-table-column>
    </el-table>
    </div>

    <el-dialog v-model="visible" title="代学生请假" :width="isMobile ? '90%' : '420px'">
      <el-form :model="form" label-width="90px">
        <el-form-item label="学生">
          <el-select v-model="form.student_id" filterable placeholder="请选择学生" style="width:100%">
            <el-option
              v-for="student in students"
              :key="student.id"
              :label="`${student.name}（${student.card_no || '无卡号'}）`"
              :value="student.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="请假日期">
          <el-date-picker v-model="form.leave_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="班次名称">
          <el-input v-model="form.session_name" placeholder="如：上学 / 放学" />
        </el-form-item>
        <el-form-item label="请假原因">
          <el-input v-model="form.reason" type="textarea" :rows="3" placeholder="可选填写" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible=false">取消</el-button>
        <el-button type="primary" @click="submitLeave">提交</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import api from '../api';
import { useSchoolStore } from '../stores/school';
import { useAuthStore } from '../stores/auth';
import { useIsMobile } from '../composables/useIsMobile';

const { isMobile } = useIsMobile();

const schoolStore = useSchoolStore();
const authStore = useAuthStore();
const list = ref([]);
const students = ref([]);
const visible = ref(false);
const form = ref({ student_id: null, leave_date: '', session_name: '', reason: '' });
const date = ref('');
const status = ref('');
const sessionName = ref('');
const keyword = ref('');

function fmtDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('zh-CN');
}

function fmtDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
}

async function loadStudents() {
  students.value = await api.get('/students', {
    params: { school_id: schoolStore.current?.id || Number(authStore.schoolId || 0) || undefined }
  });
}

async function load() {
  const params = {
    school_id: schoolStore.current?.id || Number(authStore.schoolId || 0) || undefined,
    date: date.value || undefined,
    status: status.value || undefined,
    session_name: sessionName.value.trim() || undefined,
    keyword: keyword.value.trim() || undefined
  };
  list.value = await api.get('/leave-requests', { params });
}

function openCreateDialog() {
  form.value = { student_id: null, leave_date: '', session_name: '', reason: '' };
  visible.value = true;
}

async function submitLeave() {
  if (!form.value.student_id || !form.value.leave_date || !form.value.session_name.trim()) {
    ElMessage.warning('请先选择学生、日期并填写班次名称');
    return;
  }

  await api.post('/leave-requests', {
    student_id: form.value.student_id,
    leave_date: form.value.leave_date,
    session_name: form.value.session_name.trim(),
    reason: form.value.reason.trim()
  });
  visible.value = false;
  ElMessage.success('请假提交成功');
  await Promise.all([load(), loadStudents()]);
}

onMounted(async () => {
  await Promise.all([load(), loadStudents()]);
});
</script>
