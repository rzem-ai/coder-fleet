import './style.css';
import { createApp } from 'vue';
import App from './App.vue';

// Dark mode follows the system's setting, as the design's dark board does.
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const follow = () => document.documentElement.classList.toggle('dark', dark.matches);
follow();
dark.addEventListener('change', follow);

createApp(App).mount('#app');
