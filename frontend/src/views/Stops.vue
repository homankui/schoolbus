<template>
  <el-card>
    <template #header>
      <span>站点管理</span>
      <span style="float:right;display:flex;gap:8px;flex-wrap:wrap">
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索站点名称"
          size="small"
          style="width:180px"
        />
        <el-select v-model="filterSessionId" clearable placeholder="选择班次" size="small" style="width:160px" @change="load">
          <el-option v-for="s in sessions" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-button size="small" @click="exportCSV">导出</el-button>
        <el-button type="primary" size="small" :disabled="!filterSessionId" @click="openDialog()">新增站点</el-button>
      </span>
    </template>
    <div style="width:100%;overflow-x:auto">
    <el-table :data="filteredList" row-key="id">
      <el-table-column prop="order" label="顺序" width="70" />
      <el-table-column prop="name" label="站点名称" />
      <el-table-column prop="arrive_time" label="到站时间" width="100" />
      <el-table-column prop="arrival_radius_m" label="到站半径(m)" width="110" />
      <el-table-column prop="lat" label="纬度" />
      <el-table-column prop="lng" label="经度" />
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="del(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-dialog v-model="visible" :title="form.id?'编辑站点':'新增站点'" :width="isMobile ? '90%' : '600px'" @opened="initPickerMap">
      <el-form :model="form" label-width="90px">
        <el-form-item label="站点名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="顺序"><el-input-number v-model="form.order" :min="1" /></el-form-item>
        <el-form-item label="到站时间">
          <el-time-picker v-model="form.arrive_time" format="HH:mm" value-format="HH:mm" />
        </el-form-item>
        <el-form-item label="到站半径">
          <el-input-number v-model="form.arrival_radius_m" :min="30" :max="500" :step="10" style="width:100%" />
        </el-form-item>
        <el-form-item label="搜索地址">
          <div style="display:flex;gap:6px;width:100%">
            <el-input v-model="searchKeyword" placeholder="输入地址搜索" @keyup.enter="searchPlace" style="flex:1" />
            <el-button :loading="searching" @click="searchPlace">搜索</el-button>
          </div>
          <div v-if="searchResults.length" style="border:1px solid #eee;border-radius:4px;margin-top:4px;max-height:160px;overflow-y:auto">
            <div
              v-for="r in searchResults"
              :key="r.id || `${r.name}-${r.lng}-${r.lat}`"
              style="padding:6px 10px;cursor:pointer;font-size:13px"
              @mouseenter="$event.target.style.background='#f5f7fa'"
              @mouseleave="$event.target.style.background=''"
              @click="selectPlace(r)"
            >
              {{ r.name }}
              <span style="color:#999;font-size:12px">{{ r.address || '无详细地址' }}</span>
            </div>
          </div>
          <div style="color:#999;font-size:12px;margin-top:4px">先搜索候选地址，点击候选结果后地图会跳转，再点击地图可微调站点位置</div>
        </el-form-item>
        <el-form-item label="地图选点">
          <div id="stop-picker-map" style="width:100%;height:220px;border-radius:4px;border:1px solid #ddd"></div>
          <div style="color:#999;font-size:12px;margin-top:4px">点击地图可直接选点；若搜索不到，请直接在地图上点选站点位置</div>
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
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import api from '../api';
import { useSchoolStore } from '../stores/school';
import { useIsMobile } from '../composables/useIsMobile';

const { isMobile } = useIsMobile();
const sid = useSchoolStore().current?.id;
const route = useRoute();
const amapJsKey = import.meta.env.VITE_AMAP_JS_KEY || '';
const list = ref([]);
const sessions = ref([]);
const visible = ref(false);
const form = ref({});
const filterSessionId = ref(route.query.session_id ? +route.query.session_id : null);
const keyword = ref('');
const searchKeyword = ref('');
const searchResults = ref([]);
const searching = ref(false);
let pickerMap = null;
let pickerMarker = null;
let amapLoader = null;

const filteredList = computed(() => {
  const text = String(keyword.value || '').trim().toLowerCase();
  if (!text) return list.value;
  return list.value.filter(item => String(item.name || '').toLowerCase().includes(text));
});

function getAMap() { return window.AMap; }

function ensureAmapLoaded() {
  if (!amapJsKey) return Promise.reject(new Error('未配置高德地图 JS Key'));
  if (getAMap()) return Promise.resolve(getAMap());
  if (amapLoader) return amapLoader;
  amapLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-amap-sdk="stop-picker"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(getAMap()), { once: true });
      existing.addEventListener('error', () => {
        amapLoader = null;
        reject(new Error('高德地图加载失败'));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.dataset.amapSdk = 'stop-picker';
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(amapJsKey)}`;
    script.onload = () => resolve(getAMap());
    script.onerror = () => {
      amapLoader = null;
      reject(new Error('高德地图加载失败'));
    };
    document.head.appendChild(script);
  });
  return amapLoader;
}

function mapCenterForDialog() {
  if (form.value.lng && form.value.lat) return [+form.value.lng, +form.value.lat];
  const currentSessionStops = list.value.filter(item => Number(item.session_id) === Number(filterSessionId.value) && item.lng && item.lat);
  if (currentSessionStops.length) {
    const lng = currentSessionStops.reduce((sum, item) => sum + Number(item.lng), 0) / currentSessionStops.length;
    const lat = currentSessionStops.reduce((sum, item) => sum + Number(item.lat), 0) / currentSessionStops.length;
    return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
  }
  return [116.4074, 39.9042];
}

function setMarkerPosition(lng, lat) {
  if (!pickerMap) return;
  if (pickerMarker) pickerMarker.setPosition([lng, lat]);
  else pickerMarker = new window.AMap.Marker({ position: [lng, lat], map: pickerMap });
}

async function initPickerMap() {
  try {
    await ensureAmapLoaded();
    const AMap = getAMap();
    if (pickerMap) { pickerMap.destroy(); pickerMap = null; pickerMarker = null; }
    const center = mapCenterForDialog();
    pickerMap = new AMap.Map('stop-picker-map', { zoom: 14, center });
    if (form.value.lng && form.value.lat) {
      setMarkerPosition(+form.value.lng, +form.value.lat);
    }
    pickerMap.on('click', e => {
      const { lng, lat } = e.lnglat;
      form.value.lat = lat.toFixed(6);
      form.value.lng = lng.toFixed(6);
      setMarkerPosition(lng, lat);
    });
  } catch (error) {
    ElMessage.error(error.message || '地图加载失败');
  }
}

async function searchPlace() {
  const keywordText = searchKeyword.value.trim();
  if (!keywordText) {
    ElMessage.warning('请输入地址关键词');
    return;
  }
  try {
    searching.value = true;
    const results = await api.get('/map/search', { params: { keyword: keywordText } });
    searchResults.value = Array.isArray(results) ? results : [];
    if (!searchResults.value.length) {
      ElMessage.warning('未找到可用地址，请换关键词或直接点击地图选点');
      return;
    }
    if (searchResults.value.length === 1) {
      selectPlace(searchResults.value[0], false);
      return;
    }
    ElMessage.success('请选择最接近的搜索结果进行定位');
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message || '地址搜索失败');
  } finally {
    searching.value = false;
  }
}

function selectPlace(poi, showMessage = true) {
  const lng = Number(poi?.lng);
  const lat = Number(poi?.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
  form.value.lng = lng.toFixed(6);
  form.value.lat = lat.toFixed(6);
  if (!form.value.name) form.value.name = poi.name;
  searchKeyword.value = poi.name || searchKeyword.value;
  searchResults.value = [];
  if (pickerMap) {
    pickerMap.setCenter([lng, lat]);
    setMarkerPosition(lng, lat);
  }
  if (showMessage) ElMessage.success('已定位到搜索结果，请在地图上点击目标位置完成选点');
}

async function load() {
  sessions.value = await api.get('/sessions', { params: { school_id: sid } });
  if (filterSessionId.value)
    list.value = await api.get('/stops', { params: { session_id: filterSessionId.value } });
  else list.value = [];
}

function openDialog(row = {}) {
  form.value = { session_id: filterSessionId.value, arrival_radius_m: 120, ...row };
  searchKeyword.value = row.name || '';
  searchResults.value = [];
  visible.value = true;
}

async function save() {
  if (!String(form.value.name || '').trim()) {
    ElMessage.warning('请填写站点名称');
    return;
  }
  if (!form.value.session_id) {
    ElMessage.warning('请先选择班次');
    return;
  }
  const lat = Number(form.value.lat);
  const lng = Number(form.value.lng);
  form.value.arrival_radius_m = Number(form.value.arrival_radius_m || 120);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    ElMessage.warning('请先完成站点定位并生成有效经纬度');
    return;
  }
  if (form.value.id) await api.put(`/stops/${form.value.id}`, form.value);
  else await api.post('/stops', form.value);
  visible.value = false;
  ElMessage.success('保存成功');
  load();
}

async function del(id) {
  await ElMessageBox.confirm('确认删除？');
  await api.delete(`/stops/${id}`);
  ElMessage.success('删除成功');
  load();
}

function exportCSV() {
  if (filterSessionId.value) window.open(`/api/stops/export?session_id=${filterSessionId.value}`);
}

onMounted(load);
</script>
