import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '');
  const username = ref(localStorage.getItem('username') || '');

  function setAuth(data) {
    token.value = data.token;
    username.value = data.username;
    localStorage.setItem('token', data.token);
    localStorage.setItem('username', data.username);
  }

  function logout() {
    token.value = '';
    username.value = '';
    localStorage.clear();
    window.location.href = '/login';
  }

  return { token, username, setAuth, logout };
});
