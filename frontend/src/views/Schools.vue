<template>
  <el-card>
    <template #header>
      <span>学校管理</span>
      <el-button type="primary" size="small" style="float:right" @click="openDialog()">新增学校</el-button>
    </template>
    <div style="width:100%;overflow-x:auto">
    <el-table :data="list">
      <el-table-column prop="name" label="学校名称" />
      <el-table-column prop="address" label="地址" />
      <el-table-column prop="contact" label="联系电话" width="140" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="primary" plain @click="switchTo(row)">切换到此校</el-button>
          <el-button size="small" type="danger" @click="del(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-dialog v-model="visible" :title="form.id ? '编辑学校' : '新增学校'" :width="isMobile ? '90%' : '440px'">
      <el-form :model="form" label-width="90px">
        <el-form-item label="学校名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="地址"><el-input v-model="form.address" /></el-form-item>
        <el-form-item label="联系电话"><el-input v-model="form.contact" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '../api';
import { useSchoolStore } from '../stores/school';
import { useIsMobile } from '../composables/useIsMobile';

const { isMobile } = useIsMobile();
const schoolStore = useSchoolStore();
const list = ref([]);
const visible = ref(false);
const form = ref({});

async function load() { list.value = await api.get('/schools'); }

function openDialog(row = {}) { form.value = { ...row }; visible.value = true; }

async function save() {
  if (form.value.id) {
    await api.put(`/schools/${form.value.id}`, form.value);
    if (schoolStore.current?.id === form.value.id) schoolStore.select(form.value);
  } else {
    const created = await api.post('/schools', form.value);
    if (!schoolStore.current) schoolStore.select(created);
  }
  visible.value = false;
  ElMessage.success('保存成功');
  load();
}

async function del(id) {
  await ElMessageBox.confirm('删除学校将影响关联数据，确认删除？', '警告', { type: 'warning' });
  await api.delete(`/schools/${id}`);
  if (schoolStore.current?.id === id) schoolStore.clear();
  ElMessage.success('删除成功');
  load();
}

function switchTo(school) {
  schoolStore.select(school);
  ElMessage.success(`已切换到 ${school.name}`);
}

onMounted(load);
</script>
