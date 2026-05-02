<template>
  <el-card>
    <template #header>
      <span>班级老师管理</span>
      <el-button type="primary" size="small" style="float:right" @click="openDialog()">新增</el-button>
    </template>

    <el-table :data="list" size="small">
      <el-table-column prop="name" label="姓名" width="90" />
      <el-table-column prop="phone" label="电话" width="130" />
      <el-table-column prop="username" label="用户名" width="110" />
      <el-table-column prop="Grade.name" label="年级" width="80" />
      <el-table-column prop="Class.name" label="班级" width="70" />
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="del(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="visible" :title="form.id?'编辑班级老师':'新增班级老师'" width="440px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="用户名"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" :placeholder="form.id?'留空不修改':'请输入密码'" show-password />
        </el-form-item>
        <el-form-item label="年级">
          <el-select v-model="form.grade_id" clearable placeholder="选择年级" style="width:100%" @change="form.class_id=null">
            <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="班级">
          <el-select v-model="form.class_id" clearable placeholder="选择班级" style="width:100%">
            <el-option v-for="c in dialogClasses" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible=false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
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
const list    = ref([]);
const grades  = ref([]);
const classes = ref([]);
const visible = ref(false);
const form    = ref({});

const dialogClasses = computed(() =>
  form.value.grade_id ? classes.value.filter(c => c.grade_id === form.value.grade_id) : classes.value
);

async function load() {
  [list.value, grades.value, classes.value] = await Promise.all([
    api.get('/class-teachers', { params: { school_id: sid } }),
    api.get('/grades',         { params: { school_id: sid } }),
    api.get('/classes',        { params: { school_id: sid } })
  ]);
}

function openDialog(row = {}) {
  form.value = { school_id: sid, ...row, password: '' };
  visible.value = true;
}

async function save() {
  const data = { ...form.value };
  if (!data.password) delete data.password;
  if (data.id) await api.put(`/class-teachers/${data.id}`, data);
  else await api.post('/class-teachers', data);
  visible.value = false;
  ElMessage.success('保存成功');
  load();
}

async function del(id) {
  await ElMessageBox.confirm('确认删除该班级老师？');
  await api.delete(`/class-teachers/${id}`);
  ElMessage.success('删除成功');
  load();
}

onMounted(load);
</script>
