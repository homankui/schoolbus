<template>
  <el-card>
    <template #header>
      <span>公众号绑定</span>
      <el-tag v-if="unboundCount > 0" type="warning" effect="dark" style="margin-left:12px">
        还有 {{ unboundCount }} 名未绑定
      </el-tag>
      <el-tag v-else type="success" effect="plain" style="margin-left:12px">
        全部已绑定
      </el-tag>
      <span style="margin-left:12px;font-size:12px;color:#909399">
        已绑定 {{ boundCount }} / 未绑定 {{ unboundCount }} / 共 {{ total }}
      </span>
      <span style="float:right;display:flex;gap:8px;flex-wrap:wrap">
        <el-input v-model="search" placeholder="搜索姓名/卡号/家长" size="small" style="width:180px" clearable @change="load" />
        <el-select v-model="filterBound" clearable placeholder="绑定状态" size="small" style="width:110px" @change="load">
          <el-option label="已绑定" value="true" />
          <el-option label="未绑定" value="false" />
        </el-select>
        <el-button size="small" @click="filterBound='true'; load()">只看已绑定</el-button>
        <el-button size="small" @click="filterBound='false'; load()">只看未绑定</el-button>
        <el-button size="small" @click="resetFilters">清空筛选</el-button>
      </span>
    </template>

    <div style="width:100%;overflow-x:auto">
    <el-table :data="list" size="small" v-loading="loading">
      <el-table-column prop="name" label="学生姓名" width="90" />
      <el-table-column prop="card_no" label="卡号" width="120" />
      <el-table-column prop="grade_name" label="年级" width="80" />
      <el-table-column prop="class_name" label="班级" width="70" />
      <el-table-column prop="parent_name" label="家长姓名" width="100" />
      <el-table-column prop="parent_phone" label="家长电话" width="130" />
      <el-table-column label="绑定状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.bound ? 'success' : 'danger'" size="small">
            {{ row.bound ? '已绑定' : '未绑定' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="parent_openid" label="OpenID" min-width="200">
        <template #default="{ row }">
          <span style="font-size:12px;color:#909399;word-break:break-all">{{ row.parent_openid || '-' }}</span>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-pagination
      style="margin-top:16px;justify-content:flex-end"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50]"
      layout="total, sizes, prev, pager, next"
      @current-change="load"
      @size-change="load"
    />
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useSchoolStore } from '../stores/school';
import api from '../api';
import { useIsMobile } from '../composables/useIsMobile';

const { isMobile } = useIsMobile();
const schoolStore = useSchoolStore();

const list = ref([]);
const total = ref(0);
const boundCount = ref(0);
const unboundCount = ref(0);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const search = ref('');
const filterBound = ref(null);

async function load() {
  loading.value = true;
  try {
    const params = {};
    const sid = schoolStore.current?.id;
    if (sid) params.school_id = sid;
    if (search.value) params.search = search.value;
    if (filterBound.value) params.bound = filterBound.value;
    params.page = page.value;
    params.pageSize = pageSize.value;

    const data = await api.get('/dashboard/parent-binding', { params });
    list.value = data.list || [];
    total.value = data.total || 0;
    boundCount.value = data.boundCount || 0;
    unboundCount.value = data.unboundCount || 0;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  search.value = '';
  filterBound.value = null;
  page.value = 1;
  load();
}

onMounted(load);
</script>
