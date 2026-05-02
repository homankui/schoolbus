import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';

createApp(App).use(ElementPlus, { locale: zhCn }).use(createPinia()).use(router).mount('#app');
