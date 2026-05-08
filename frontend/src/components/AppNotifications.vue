<script setup lang="ts">
import { computed } from "vue";
import { useNotifier } from "../composables/useNotifier";

const notifier = useNotifier();

const notificationStyles = computed(() => ({
  success: "notification-success",
  error: "notification-error",
  info: "notification-info"
}));
</script>

<template>
  <div class="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-3">
    <TransitionGroup name="toast" tag="div" class="flex flex-col gap-3">
      <article
        v-for="notification in notifier.notifications"
        :key="notification.id"
        class="notification-card rounded-xl border px-4 py-3 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl"
        :class="notificationStyles[notification.type]"
      >
        <h4 class="text-sm font-semibold tracking-wide">{{ notification.title }}</h4>
        <p v-if="notification.message" class="mt-1 text-xs/5 text-white/95">{{ notification.message }}</p>
      </article>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notification-card {
  color: #ffffff;
}

.notification-success {
  border-color: rgba(167, 243, 208, 0.95);
  background: rgba(16, 185, 129, 0.96);
}

.notification-error {
  border-color: rgba(254, 205, 211, 0.95);
  background: rgba(244, 63, 94, 0.96);
}

.notification-info {
  border-color: rgba(165, 243, 252, 0.95);
  background: rgba(6, 182, 212, 0.96);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.28s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}
</style>
