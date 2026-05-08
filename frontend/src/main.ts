import { createApp } from "vue";
import App from "./App.vue";
import { useTheme } from "./composables/useTheme";
import { router } from "./router";
import "./style.css";

useTheme().initTheme();

createApp(App).use(router).mount("#app");
