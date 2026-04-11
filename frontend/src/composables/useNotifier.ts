import { reactive, readonly } from "vue";

export type NotificationType = "success" | "error" | "info";

export type Notification = {
  id: number;
  title: string;
  message?: string;
  type: NotificationType;
};

const notifications = reactive<Notification[]>([]);
let notificationCounter = 0;

function pushNotification(type: NotificationType, title: string, message?: string, durationMs = 4200) {
  const id = ++notificationCounter;

  notifications.push({
    id,
    title,
    message,
    type
  });

  window.setTimeout(() => {
    const index = notifications.findIndex((notification) => notification.id === id);

    if (index >= 0) {
      notifications.splice(index, 1);
    }
  }, durationMs);
}

export function useNotifier() {
  return {
    notifications: readonly(notifications),
    success(title: string, message?: string, durationMs?: number) {
      pushNotification("success", title, message, durationMs);
    },
    error(title: string, message?: string, durationMs?: number) {
      pushNotification("error", title, message, durationMs);
    },
    info(title: string, message?: string, durationMs?: number) {
      pushNotification("info", title, message, durationMs);
    }
  };
}
