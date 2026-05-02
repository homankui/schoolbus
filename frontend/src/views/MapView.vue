<template>
  <el-card style="height:calc(100vh - 120px)">
    <template #header>
      <span>实时位置追踪</span>
      <el-tag v-for="(loc, id) in busStore.locations" :key="id" style="margin-left:8px">
        车辆{{ id }}: {{ loc.speed }}km/h
      </el-tag>
    </template>
    <div id="map-container" style="width:100%;height:calc(100vh - 200px)"></div>
  </el-card>
</template>

<script setup>
import { onMounted, onUnmounted, watch } from 'vue';
import { useBusStore } from '../stores/bus';

const busStore = useBusStore();
let map = null;
const markers = {};

onMounted(() => {
  busStore.connect();
  const script = document.createElement('script');
  script.src = 'https://webapi.amap.com/maps?v=2.0&key=d7dd13a7159db4adbc4028e0309e71bf';
  script.onload = initMap;
  document.head.appendChild(script);
});

function initMap() {
  map = new AMap.Map('map-container', { zoom: 12, center: [116.4074, 39.9042] });
}

watch(() => busStore.locations, (locs) => {
  if (!map) return;
  Object.entries(locs).forEach(([id, loc]) => {
    if (markers[id]) {
      markers[id].setPosition([loc.lng, loc.lat]);
    } else {
      markers[id] = new AMap.Marker({
        position: [loc.lng, loc.lat],
        title: `校车${id}`,
        label: { content: `校车${id}`, direction: 'top' }
      });
      map.add(markers[id]);
    }
  });
}, { deep: true });

onUnmounted(() => busStore.disconnect());
</script>
