<template>
  <el-card style="height:calc(100vh - 120px)">
    <template #header>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span>车辆轨迹回放</span>
        <el-select v-model="selectedSessionId" placeholder="选择班次" size="small" style="width:280px" @change="onSessionChange">
          <el-option v-for="s in sessions" :key="s.id" :label="`${s.name} - ${s.Bus?.plate || '未分配车辆'} (${s.type==='morning'?'上学':'放学'})`" :value="s.id" />
        </el-select>
        <el-date-picker
          v-model="timeRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始"
          end-placeholder="结束"
          format="MM-DD HH:mm"
          value-format="YYYY-MM-DDTHH:mm:ss"
          size="small"
          style="width:280px"
        />
        <el-button type="primary" size="small" @click="loadTrajectory" :loading="loading">查询</el-button>
        <span v-if="points.length" style="font-size:12px;color:#909399">
          {{ points.length }} 个轨迹点
        </span>
      </div>
    </template>

    <div :style="{ display:'flex', flexDirection:'column', height: isMobile ? 'calc(100vh - 300px)' : 'calc(100vh - 210px)', gap:'0' }">
      <!-- 地图 -->
      <div id="trajectory-map-container" style="flex:1;width:100%;min-height:0"></div>

      <!-- 播放控制条 -->
      <div v-if="points.length"
        style="background:#fff;border:1px solid var(--el-border-color);border-top:0;border-radius:0 0 8px 8px;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <el-button-group size="small">
          <el-button @click="togglePlay">
            {{ playing ? '暂停' : '播放' }}
          </el-button>
          <el-button @click="resetPlayback">重置</el-button>
        </el-button-group>

        <el-radio-group v-model="speed" size="small" @change="onSpeedChange">
          <el-radio-button :value="1">1x</el-radio-button>
          <el-radio-button :value="2">2x</el-radio-button>
          <el-radio-button :value="4">4x</el-radio-button>
          <el-radio-button :value="8">8x</el-radio-button>
        </el-radio-group>

        <div style="flex:1;display:flex;align-items:center;gap:8px;min-width:200px">
          <span style="font-size:11px;color:#999;white-space:nowrap">{{ formatTimeShort(points[progressIndex]?.timestamp) }}</span>
          <el-slider v-model="progressIndex" :min="0" :max="points.length - 1" :step="1" style="flex:1" @input="onSliderChange" />
          <span style="font-size:11px;color:#999;white-space:nowrap">{{ formatTimeShort(points[points.length - 1]?.timestamp) }}</span>
        </div>

        <span style="font-size:12px;color:#666;white-space:nowrap">
          速度: {{ currentSpeed != null ? Math.round(currentSpeed) + ' km/h' : '-' }}
        </span>
      </div>

      <el-empty v-if="queried && !points.length" description="该时间段暂无轨迹数据" style="margin-top:-60px" />
    </div>
  </el-card>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import api from '../api';
import { useSchoolStore } from '../stores/school';
import { useIsMobile } from '../composables/useIsMobile';

const schoolStore = useSchoolStore();
const { isMobile } = useIsMobile();
const amapJsKey = import.meta.env.VITE_AMAP_JS_KEY || '';

// ── 表单状态 ──
const sessions = ref([]);
const selectedSessionId = ref(null);
const queryBusId = ref(null);
const timeRange = ref([]);
const loading = ref(false);
const queried = ref(false);
const points = ref([]);
const stops = ref([]);

// ── 播放状态 ──
const playing = ref(false);
const speed = ref(1);
const progressIndex = ref(0);
const currentSpeed = ref(null);

// ── AMap 实例 ──
let map = null;
let polyline = null;
let animatedMarker = null;
let startMarker = null;
let endMarker = null;
let stopMarkers = [];
let playbackTimer = null;
let amapLoader = null;

// ── 加载班次列表 ──
async function loadSessions() {
  try {
    const sid = schoolStore.current?.id;
    sessions.value = await api.get('/sessions', { params: sid ? { school_id: sid } : {} });
  } catch {}
}

// ── 班次切换：自动设置车辆和时间范围 ──
async function onSessionChange() {
  const session = sessions.value.find(s => s.id === selectedSessionId.value);
  queryBusId.value = session?.bus_id || session?.Bus?.id || null;

  // 加载该班次的站点
  stops.value = [];
  if (selectedSessionId.value) {
    try {
      stops.value = await api.get('/stops', { params: { session_id: selectedSessionId.value } });
    } catch {}
  }

  if (session?.depart_time) {
    const parts = String(session.depart_time).split(':');
    if (parts.length >= 2) {
      const today = new Date();
      const h = parseInt(parts[0]), m = parseInt(parts[1]);
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h - 1, m, 0);
      const end   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h + 3, m, 0);
      timeRange.value = [
        start.toISOString().slice(0, 19),
        end.toISOString().slice(0, 19)
      ];
    }
  }
}

// ── 加载 AMap SDK ──
async function ensureAmapLoaded() {
  if (!amapJsKey) throw new Error('未配置高德地图 JS Key');
  if (window.AMap) return window.AMap;
  if (amapLoader) return amapLoader;
  amapLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-amap-sdk="trajectory-map"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.AMap), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.dataset.amapSdk = 'trajectory-map';
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(amapJsKey)}`;
    script.onload = () => resolve(window.AMap);
    script.onerror = () => { amapLoader = null; reject(new Error('高德地图加载失败')); };
    document.head.appendChild(script);
  });
  return amapLoader;
}

// ── 加载轨迹数据 ──
async function loadTrajectory() {
  if (!selectedSessionId.value || !queryBusId.value) { ElMessage.warning('请选择班次'); return; }
  if (!timeRange.value || timeRange.value.length !== 2) { ElMessage.warning('请选择时间范围'); return; }

  stopPlayback();
  playing.value = false;
  loading.value = true;
  queried.value = true;

  try {
    const res = await api.get('/bus-trajectory', {
      params: {
        bus_id: queryBusId.value,
        start_time: timeRange.value[0],
        end_time: timeRange.value[1]
      }
    });
    points.value = res.points || [];
    if (points.value.length) {
      await ensureAmapLoaded();
      if (!map) initMap();
      drawTrajectory();
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e?.message || '查询失败');
  } finally {
    loading.value = false;
  }
}

// ── 初始化地图 ──
function initMap() {
  map = new AMap.Map('trajectory-map-container', { zoom: 12, center: [116.4074, 39.9042] });
}

// ── 绘制轨迹 ──
function drawTrajectory() {
  clearOverlays();

  const path = points.value.map(p => [p.lng, p.lat]);
  polyline = new AMap.Polyline({
    path,
    strokeColor: '#409eff',
    strokeWeight: 4,
    strokeOpacity: 0.7,
    lineJoin: 'round'
  });
  map.add(polyline);
  map.setFitView([polyline]);

  // 起点（绿圆点）
  const first = points.value[0];
  startMarker = new AMap.Marker({
    position: [first.lng, first.lat],
    label: { content: '起点', direction: 'top', offset: [0, -12] },
    icon: new AMap.Icon({
      size: [16, 16],
      image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7" fill="%234CAF50" stroke="white" stroke-width="1.5"/></svg>'
    }),
    zIndex: 90
  });
  map.add(startMarker);

  // 终点（红圆点）
  const last = points.value[points.value.length - 1];
  endMarker = new AMap.Marker({
    position: [last.lng, last.lat],
    label: { content: '终点', direction: 'top', offset: [0, -12] },
    icon: new AMap.Icon({
      size: [16, 16],
      image: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7" fill="%23F56C6C" stroke="white" stroke-width="1.5"/></svg>'
    }),
    zIndex: 90
  });
  map.add(endMarker);

  // 站点标记
  stopMarkers = (stops.value || []).map(stop => {
    if (stop.lat == null || stop.lng == null) return null;
    const marker = new AMap.Marker({
      position: [stop.lng, stop.lat],
      offset: new AMap.Pixel(-8, -8),
      label: { content: `${stop.order != null ? stop.order + '.' : ''}${stop.name || ''}`, direction: 'right', offset: [8, 0] },
      icon: new AMap.Icon({
        size: [16, 16],
        imageSize: [16, 16],
        image: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" fill="%23E6A23C" stroke="white" stroke-width="2"/><circle cx="8" cy="8" r="2" fill="white"/></svg>`)
      }),
      zIndex: 85
    });
    map.add(marker);
    return marker;
  }).filter(Boolean);

  // 车辆动画标记
  animatedMarker = new AMap.Marker({
    position: [first.lng, first.lat],
    label: { content: '车辆', direction: 'top', offset: [0, -14] },
    icon: new AMap.Icon({
      size: [36, 24],
      image: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" width="48" height="32"><rect x="2" y="2" width="44" height="20" rx="4" fill="#FF9800" stroke="#E65100" stroke-width="1.5"/><rect x="6" y="5" width="10" height="7" rx="1.5" fill="#FFF3E0"/><rect x="19" y="5" width="10" height="7" rx="1.5" fill="#FFF3E0"/><rect x="32" y="5" width="10" height="7" rx="1.5" fill="#FFF3E0"/><circle cx="11" cy="25" r="3.5" fill="#333" stroke="#555" stroke-width="1"/><circle cx="37" cy="25" r="3.5" fill="#333" stroke="#555" stroke-width="1"/></svg>`)
    }),
    zIndex: 100
  });
  map.add(animatedMarker);

  progressIndex.value = 0;
  currentSpeed.value = first.speed;
}

function clearOverlays() {
  [polyline, animatedMarker, startMarker, endMarker].forEach(m => {
    if (m) { map.remove(m); }
  });
  (stopMarkers || []).forEach(m => { if (m) map.remove(m); });
  polyline = null;
  animatedMarker = null;
  startMarker = null;
  endMarker = null;
  stopMarkers = [];
}

// ── 播放控制 ──
function togglePlay() {
  if (points.value.length < 2) return;
  playing.value = !playing.value;
  if (playing.value) startPlayback();
  else stopPlayback();
}

function startPlayback() {
  stopPlayback();
  if (progressIndex.value >= points.value.length - 1) progressIndex.value = 0;
  const interval = calcInterval();
  playbackTimer = setInterval(() => {
    if (progressIndex.value >= points.value.length - 1) {
      stopPlayback();
      playing.value = false;
      return;
    }
    progressIndex.value++;
    updateMarker();
  }, interval);
}

function stopPlayback() {
  if (playbackTimer) { clearInterval(playbackTimer); playbackTimer = null; }
}

function resetPlayback() {
  stopPlayback();
  playing.value = false;
  progressIndex.value = 0;
  updateMarker();
}

function calcInterval() {
  if (points.value.length < 2) return 1000;
  const total = new Date(points.value[points.value.length - 1].timestamp).getTime()
              - new Date(points.value[0].timestamp).getTime();
  const avg = total / points.value.length;
  return Math.max(150, Math.min(2000, avg / speed.value));
}

function onSliderChange() {
  updateMarker();
  if (playing.value) { stopPlayback(); startPlayback(); }
}

function onSpeedChange() {
  if (playing.value) { stopPlayback(); startPlayback(); }
}

function updateMarker() {
  const pt = points.value[progressIndex.value];
  if (!pt || !animatedMarker) return;
  animatedMarker.setPosition([pt.lng, pt.lat]);
  currentSpeed.value = pt.speed;
}

// ── 时间格式化 ──
function formatTimeShort(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── 生命周期 ──
onMounted(async () => {
  await loadSessions();
  await ensureAmapLoaded();
  if (!map) initMap();
});

onUnmounted(() => stopPlayback());
</script>

<style scoped>
#trajectory-map-container {
  border-radius: 8px 8px 0 0;
}
</style>
