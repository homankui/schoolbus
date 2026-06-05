<template>
  <div>
    <el-row :gutter="16">
      <el-col :xs="24" :span="12">
        <el-card>
          <template #header>
            <span>年级管理</span>
            <el-button type="primary" size="small" style="float:right" @click="openGradeDialog()">新增年级</el-button>
          </template>
          <div style="width:100%;overflow-x:auto">
          <el-table :data="grades" size="small">
            <el-table-column prop="name" label="年级名称" />
            <el-table-column label="班级数">
              <template #default="{ row }">{{ classes.filter(c=>c.grade_id===row.id).length }}</template>
            </el-table-column>
            <el-table-column label="操作" width="140">
              <template #default="{ row }">
                <el-button size="small" @click="openGradeDialog(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="delGrade(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :span="12">
        <el-card>
          <template #header>
            <span>班级管理</span>
            <el-button type="primary" size="small" style="float:right" @click="openClassDialog()">新增班级</el-button>
          </template>
          <div style="width:100%;overflow-x:auto">
          <el-table :data="classes" size="small">
            <el-table-column prop="Grade.name" label="年级" />
            <el-table-column prop="name" label="班级名称" />
            <el-table-column label="操作" width="140">
              <template #default="{ row }">
                <el-button size="small" @click="openClassDialog(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="delClass(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="gradeVisible" :title="gradeForm.id?'编辑年级':'新增年级'" :width="isMobile ? '90%' : '360px'">
      <el-form :model="gradeForm" label-width="80px">
        <el-form-item label="年级名称"><el-input v-model="gradeForm.name" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="gradeVisible=false">取消</el-button>
        <el-button type="primary" @click="saveGrade">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="classVisible" :title="classForm.id?'编辑班级':'新增班级'" :width="isMobile ? '90%' : '360px'">
      <el-form :model="classForm" label-width="80px">
        <el-form-item label="所属年级">
          <el-select v-model="classForm.grade_id">
            <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="班级名称"><el-input v-model="classForm.name" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="classVisible=false">取消</el-button>
        <el-button type="primary" @click="saveClass">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '../api';
import { useSchoolStore } from '../stores/school';
import { useIsMobile } from '../composables/useIsMobile';

const { isMobile } = useIsMobile();
const sid = useSchoolStore().current?.id;
const grades = ref([]);
const classes = ref([]);
const gradeVisible = ref(false);
const classVisible = ref(false);
const gradeForm = ref({});
const classForm = ref({});

async function load() {
  [grades.value, classes.value] = await Promise.all([
    api.get('/grades',  { params: { school_id: sid } }),
    api.get('/classes', { params: { school_id: sid } })
  ]);
}

function openGradeDialog(row = {}) { gradeForm.value = { school_id: sid, ...row }; gradeVisible.value = true; }
async function saveGrade() {
  if (gradeForm.value.id) await api.put(`/grades/${gradeForm.value.id}`, gradeForm.value);
  else await api.post('/grades', gradeForm.value);
  gradeVisible.value = false; ElMessage.success('保存成功'); load();
}
async function delGrade(id) {
  await ElMessageBox.confirm('确认删除？');
  await api.delete(`/grades/${id}`); ElMessage.success('删除成功'); load();
}

function openClassDialog(row = {}) { classForm.value = { school_id: sid, ...row }; classVisible.value = true; }
async function saveClass() {
  if (classForm.value.id) await api.put(`/classes/${classForm.value.id}`, classForm.value);
  else await api.post('/classes', classForm.value);
  classVisible.value = false; ElMessage.success('保存成功'); load();
}
async function delClass(id) {
  await ElMessageBox.confirm('确认删除？');
  await api.delete(`/classes/${id}`); ElMessage.success('删除成功'); load();
}

onMounted(load);
</script>
