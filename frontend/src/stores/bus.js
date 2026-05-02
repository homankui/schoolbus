import { defineStore } from 'pinia';
import { ref } from 'vue';
import { io } from 'socket.io-client';

export const useBusStore = defineStore('bus', () => {
  const locations = ref({});
  let socket = null;

  function connect() {
    socket = io('/');
    socket.on('bus:location', (data) => {
      locations.value[data.busId] = data;
    });
  }

  function disconnect() {
    socket?.disconnect();
  }

  return { locations, connect, disconnect };
});
