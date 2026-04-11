import { createRouter, createWebHistory } from "vue-router";
import AppShell from "../layouts/AppShell.vue";
import BasesPage from "../pages/BasesPage.vue";
import CategoriesPage from "../pages/CategoriesPage.vue";
import CompanyPage from "../pages/CompanyPage.vue";
import DashboardPage from "../pages/DashboardPage.vue";
import LoginPage from "../pages/LoginPage.vue";
import MovementDetailPage from "../pages/MovementDetailPage.vue";
import MovementsPage from "../pages/MovementsPage.vue";
import ProfilePage from "../pages/ProfilePage.vue";
import ProductsPage from "../pages/ProductsPage.vue";
import ReportsPage from "../pages/ReportsPage.vue";
import UsersPage from "../pages/UsersPage.vue";
import { useAuthStore } from "../stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/app/dashboard"
    },
    {
      path: "/login",
      name: "login",
      component: LoginPage,
      meta: {
        title: "Acesso",
        guestOnly: true
      }
    },
    {
      path: "/app",
      component: AppShell,
      meta: {
        requiresAuth: true
      },
      children: [
        {
          path: "",
          redirect: "/app/dashboard"
        },
        {
          path: "dashboard",
          name: "dashboard",
          component: DashboardPage,
          meta: {
            title: "Painel",
            requiresAuth: true
          }
        },
        {
          path: "movements",
          name: "movements",
          component: MovementsPage,
          meta: {
            title: "Movimentações",
            requiresAuth: true
          }
        },
        {
          path: "movements/:id",
          name: "movement-detail",
          component: MovementDetailPage,
          meta: {
            title: "Movimentacao",
            requiresAuth: true
          }
        },
        {
          path: "bases",
          name: "bases",
          component: BasesPage,
          meta: {
            title: "Bases",
            requiresAuth: true
          }
        },
        {
          path: "categories",
          name: "categories",
          component: CategoriesPage,
          meta: {
            title: "Categorias",
            requiresAuth: true
          }
        },
        {
          path: "products",
          name: "products",
          component: ProductsPage,
          meta: {
            title: "Produtos",
            requiresAuth: true
          }
        },
        {
          path: "reports",
          name: "reports",
          component: ReportsPage,
          meta: {
            title: "Relatórios",
            requiresAuth: true
          }
        },
        {
          path: "company",
          name: "company",
          component: CompanyPage,
          meta: {
            title: "Empresa",
            requiresAuth: true,
            roles: ["ADMIN"]
          }
        },
        {
          path: "users",
          name: "users",
          component: UsersPage,
          meta: {
            title: "Usuários",
            requiresAuth: true,
            roles: ["ADMIN"]
          }
        },
        {
          path: "profile",
          name: "profile",
          component: ProfilePage,
          meta: {
            title: "Perfil",
            requiresAuth: true
          }
        }
      ]
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/app/dashboard"
    }
  ]
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (!auth.state.initialized) {
    await auth.bootstrap();
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated.value) {
    return {
      name: "login"
    };
  }

  if (to.meta.guestOnly && auth.isAuthenticated.value) {
    return {
      name: "dashboard"
    };
  }

  if (to.meta.roles && auth.state.user && !to.meta.roles.includes(auth.state.user.role)) {
    return {
      name: "dashboard"
    };
  }

  return true;
});

router.afterEach((to) => {
  const suffix = "Estoque ERP";
  document.title = to.meta.title ? `${to.meta.title} | ${suffix}` : suffix;
});

export { router };
