import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSchoolStore = defineStore('school', () => {
  const current = ref(JSON.parse(localStorage.getItem('currentSchool') || 'null'));

  function select(school) {
    current.value = school;
    localStorage.setItem('currentSchool', JSON.stringify(school));
  }

  function clear() {
    current.value = null;
    localStorage.removeItem('currentSchool');
  }

  return { current, select, clear };
});
