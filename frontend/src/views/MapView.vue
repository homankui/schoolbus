<template>
  <el-card style="height:calc(100vh - 120px)">
    <template #header>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <span>实时位置追踪</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <el-input
            v-model="keyword"
            placeholder="搜索班次名称"
            clearable
            style="width:180px"
            @change="loadSessions"
            @clear="loadSessions"
          />
          <el-select v-model="selectedSessionId" clearable placeholder="选择班次" style="width:220px">
            <el-option
              v-for="item in sessions"
              :key="item.sessionId"
              :label="`${item.sessionName} / ${item.busPlate || ('车辆' + item.busId)}`"
              :value="item.sessionId"
            />
          </el-select>
        </div>
      </div>
    </template>

    <div :style="{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '320px 1fr', gap:'16px', height: isMobile ? 'calc(100vh - 260px)' : 'calc(100vh - 200px)' }">
      <div :style="{ overflow:'auto', border:'1px solid var(--el-border-color)', borderRadius:'8px', padding:'12px', maxHeight: isMobile ? '200px' : 'none' }">
        <div v-for="item in filteredSessions" :key="item.sessionId" style="padding:10px 0;border-bottom:1px solid var(--el-border-color-light);cursor:pointer" @click="focusSession(item)">
          <div style="font-weight:600">{{ item.sessionName }}</div>
          <div style="font-size:12px;color:var(--el-text-color-secondary);margin-top:4px">
            {{ item.routeName || '未设置路线' }} / {{ item.busPlate || ('车辆' + item.busId) }}
          </div>
          <div style="font-size:12px;color:var(--el-text-color-secondary);margin-top:4px">
            <template v-if="item.live.hasLocation">
              {{ formatTime(item.live.timestamp) }}
            </template>
            <template v-else>暂无定位</template>
          </div>
          <div v-if="item.live.arrival?.current_stop_name" style="font-size:12px;color:#409eff;margin-top:4px">
            当前站：{{ item.live.arrival.current_stop_name }}
            <span v-if="item.live.arrival.next_stop_name"> / 下一站：{{ item.live.arrival.next_stop_name }}</span>
          </div>
        </div>
      </div>
      <div id="map-container" :style="{ width:'100%', minHeight: isMobile ? '300px' : '100%', height: isMobile ? '300px' : '100%' }"></div>
    </div>
  </el-card>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../api';
import { useBusStore } from '../stores/bus';
import { useSchoolStore } from '../stores/school';

import { useIsMobile } from '../composables/useIsMobile';

const busStore = useBusStore();
const { isMobile } = useIsMobile();
const schoolStore = useSchoolStore();
const sid = schoolStore.current?.id;
const keyword = ref('');
const selectedSessionId = ref(null);
const sessions = ref([]);
const amapJsKey = import.meta.env.VITE_AMAP_JS_KEY || '';
let map = null;
const markers = {};
let amapLoader = null;

function displayArrival(arrival) {
  if (!arrival) return null;
  if (!['arrived', 'inside'].includes(String(arrival.current_stop_status || ''))) return null;
  return arrival;
}

const mergedSessions = computed(() => sessions.value.map(item => ({
  ...item,
  live: busStore.locations[item.busId]
    ? {
        hasLocation: true,
        lat: busStore.locations[item.busId].lat,
        lng: busStore.locations[item.busId].lng,
        speed: busStore.locations[item.busId].speed,
        timestamp: busStore.locations[item.busId].timestamp,
        arrival: displayArrival(busStore.locations[item.busId].arrival || item.arrival || null)
      }
    : {
        hasLocation: item.hasLocation,
        lat: item.lat,
        lng: item.lng,
        speed: item.speed,
        timestamp: item.timestamp,
        arrival: displayArrival(item.arrival || null)
      }
})));

const filteredSessions = computed(() => {
  if (!selectedSessionId.value) return mergedSessions.value;
  return mergedSessions.value.filter(item => item.sessionId === selectedSessionId.value);
});

async function ensureAmapLoaded() {
  if (!amapJsKey) throw new Error('未配置高德地图 JS Key');
  if (window.AMap) return window.AMap;
  if (amapLoader) return amapLoader;
  amapLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-amap-sdk="realtime-map"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.AMap), { once: true });
      existing.addEventListener('error', () => {
        amapLoader = null;
        reject(new Error('高德地图加载失败'));
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.dataset.amapSdk = 'realtime-map';
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(amapJsKey)}`;
    script.onload = () => resolve(window.AMap);
    script.onerror = () => {
      amapLoader = null;
      reject(new Error('高德地图加载失败'));
    };
    document.head.appendChild(script);
  });
  return amapLoader;
}

onMounted(async () => {
  busStore.connect();
  await loadSessions();
  await ensureAmapLoaded();
  initMap();
});

async function loadSessions() {
  sessions.value = await api.get('/realtime-map/sessions', {
    params: {
      school_id: sid,
      name: keyword.value || undefined
    }
  });
}

function initMap() {
  map = new AMap.Map('map-container', { zoom: 12, center: [116.4074, 39.9042] });
  syncMarkers();
}

function syncMarkers() {
  if (!map) return;

  const visibleBusIds = new Set(
    filteredSessions.value
      .filter(item => item.live.hasLocation)
      .map(item => String(item.busId))
  );

  Object.entries(markers).forEach(([busId, marker]) => {
    if (!visibleBusIds.has(busId)) {
      map.remove(marker);
      delete markers[busId];
    }
  });

  filteredSessions.value.forEach(item => {
    if (!item.live.hasLocation) return;
    const position = [item.live.lng, item.live.lat];
    const arrivalText = item.live.arrival?.current_stop_name
      ? `<br/>当前站：${item.live.arrival.current_stop_name}${item.live.arrival.next_stop_name ? ` / 下一站：${item.live.arrival.next_stop_name}` : ''}`
      : '';
    const label = `${item.sessionName} / ${item.busPlate || ('车辆' + item.busId)}${arrivalText}`;
    const key = String(item.busId);

    if (markers[key]) {
      markers[key].setPosition(position);
      markers[key].setTitle(`${item.sessionName} / ${item.busPlate || ('车辆' + item.busId)}`);
      markers[key].setLabel({ content: label, direction: 'top' });
    } else {
      const busEl = document.createElement('div');
      busEl.className = 'bus-marker';
      busEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" width="36" height="24">
        <rect x="2" y="2" width="44" height="20" rx="4" fill="#FF9800" stroke="#E65100" stroke-width="1.5"/>
        <rect x="6" y="5" width="10" height="7" rx="1.5" fill="#FFF3E0"/>
        <rect x="19" y="5" width="10" height="7" rx="1.5" fill="#FFF3E0"/>
        <rect x="32" y="5" width="10" height="7" rx="1.5" fill="#FFF3E0"/>
        <circle cx="11" cy="25" r="3.5" fill="#333" stroke="#555" stroke-width="1"/>
        <circle cx="37" cy="25" r="3.5" fill="#333" stroke="#555" stroke-width="1"/>
      </svg>`;
      markers[key] = new AMap.Marker({
        position,
        title: `${item.sessionName} / ${item.busPlate || ('车辆' + item.busId)}`,
        content: busEl,
        offset: new AMap.Pixel(-18, -24),
        label: { content: label, direction: 'top' }
      });
      map.add(markers[key]);
    }
  });
}

function focusSession(item) {
  selectedSessionId.value = item.sessionId;
  if (!map || !item.live.hasLocation) return;
  map.setCenter([item.live.lng, item.live.lat]);
  map.setZoom(15);
}

function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString();
}

watch(filteredSessions, () => {
  syncMarkers();
}, { deep: true });

onUnmounted(() => busStore.disconnect());
</script>
