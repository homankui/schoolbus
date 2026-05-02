<template>
  <el-card>
    <template #header>
      <span>站点管理</span>
      <span style="float:right;display:flex;gap:8px">
        <el-select v-model="filterSessionId" clearable placeholder="选择班次" size="small" style="width:160px" @change="load">
          <el-option v-for="s in sessions" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-button size="small" @click="exportCSV">导出</el-button>
        <el-button type="primary" size="small" :disabled="!filterSessionId" @click="openDialog()">新增站点</el-button>
      </span>
    </template>
    <el-table :data="list" row-key="id">
      <el-table-column prop="order" label="顺序" width="70" />
      <el-table-column prop="name" label="站点名称" />
      <el-table-column prop="arrive_time" label="到站时间" width="100" />
      <el-table-column prop="lat" label="纬度" />
      <el-table-column prop="lng" label="经度" />
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="del(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="visible" :title="form.id?'编辑站点':'新增站点'" width="600px" @opened="initPickerMap">
      <el-form :model="form" label-width="90px">
        <el-form-item label="站点名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="顺序"><el-input-number v-model="form.order" :min="1" /></el-form-item>
        <el-form-item label="到站时间">
          <el-time-picker v-model="form.arrive_time" format="HH:mm" value-format="HH:mm" />
        </el-form-item>
        <el-form-item label="搜索地址">
          <div style="display:flex;gap:6px;width:100%">
            <el-input v-model="searchKeyword" placeholder="输入地址搜索" @keyup.enter="searchPlace" style="flex:1" />
            <el-button @click="searchPlace">搜索</el-button>
          </div>
          <div v-if="searchResults.length" style="border:1px solid #eee;border-radius:4px;margin-top:4px;max-height:120px;overflow-y:auto">
            <div v-for="r in searchResults" :key="r.id"
              style="padding:6px 10px;cursor:pointer;font-size:13px"
              @mouseenter="$event.target.style.background='#f5f7fa'"
              @mouseleave="$event.target.style.background=''"
              @click="selectPlace(r)">
              {{ r.name }} <span style="color:#999;font-size:12px">{{ r.district }}</span>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="地图选点">
          <div id="stop-picker-map" style="width:100%;height:220px;border-radius:4px;border:1px solid #ddd"></div>
          <div style="color:#999;font-size:12px;margin-top:4px">点击地图可直接选点</div>
        </el-form-item>
        <el-form-item label="纬度"><el-input v-model="form.lat" /></el-form-item>
        <el-form-item label="经度"><el-input v-model="form.lng" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible=false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '../api';
import { useSchoolStore } from '../stores/school';

const sid = useSchoolStore().current?.id;
const route = useRoute();
const list = ref([]);
const sessions = ref([]);
const visible = ref(false);
const form = ref({});
const filterSessionId = ref(route.query.session_id ? +route.query.session_id : null);
const searchKeyword = ref('');
const searchResults = ref([]);
let pickerMap = null;
let pickerMarker = null;

function getAMap() { return window.AMap; }

function ensureAmapLoaded() {
  if (getAMap()) return Promise.resolve();
  return new Promise(resolve => {
    const script = document.createElement('script');
    script.src = 'https://webapi.amap.com/maps?v=2.0&key=d7dd13a7159db4adbc4028e0309e71bf&plugin=AMap.PlaceSearch';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

async function initPickerMap() {
  await ensureAmapLoaded();
  const AMap = getAMap();
  if (pickerMap) { pickerMap.destroy(); pickerMap = null; pickerMarker = null; }
  const center = form.value.lng && form.value.lat
    ? [+form.value.lng, +form.value.lat] : [116.4074, 39.9042];
  pickerMap = new AMap.Map('stop-picker-map', { zoom: 14, center });
  if (form.value.lng && form.value.lat) {
    pickerMarker = new AMap.Marker({ position: center, map: pickerMap });
  }
  pickerMap.on('click', e => {
    const { lng, lat } = e.lnglat;
    form.value.lat = lat.toFixed(6);
    form.value.lng = lng.toFixed(6);
    if (pickerMarker) pickerMarker.setPosition([lng, lat]);
    else { pickerMarker = new AMap.Marker({ position: [lng, lat], map: pickerMap }); }
  });
}

async function searchPlace() {
  if (!searchKeyword.value.trim()) return;
  await ensureAmapLoaded();
  const AMap = getAMap();
  const searcher = new AMap.PlaceSearch({ pageSize: 6 });
  searcher.search(searchKeyword.value, (status, result) => {
    if (status === 'complete') {
      searchResults.value = result.poiList?.pois || [];
    }
  });
}

function selectPlace(poi) {
  const lng = poi.location.lng.toFixed(6);
  const lat = poi.location.lat.toFixed(6);
  form.value.lng = lng;
  form.value.lat = lat;
  if (!form.value.name) form.value.name = poi.name;
  searchResults.value = [];
  searchKeyword.value = poi.name;
  if (pickerMap) {
    pickerMap.setCenter([+lng, +lat]);
    if (pickerMarker) pickerMarker.setPosition([+lng, +lat]);
    else { pickerMarker = new AMap.Marker({ position: [+lng, +lat], map: pickerMap }); }
  }
}

async function load() {
  sessions.value = await api.get('/sessions', { params: { school_id: sid } });
  if (filterSessionId.value)
    list.value = await api.get('/stops', { params: { session_id: filterSessionId.value } });
  else list.value = [];
}

function openDialog(row = {}) {
  form.value = { session_id: filterSessionId.value, ...row };
  searchKeyword.value = '';
  searchResults.value = [];
  visible.value = true;
}

async function save() {
  if (form.value.id) await api.put(`/stops/${form.value.id}`, form.value);
  else await api.post('/stops', form.value);
  visible.value = false; ElMessage.success('保存成功'); load();
}

async function del(id) {
  await ElMessageBox.confirm('确认删除？');
  await api.delete(`/stops/${id}`); ElMessage.success('删除成功'); load();
}

function exportCSV() {
  if (filterSessionId.value) window.open(`/api/stops/export?session_id=${filterSessionId.value}`);
}

onMounted(load);
</script>
