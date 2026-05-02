import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  { path: '/login', component: () => import('../views/Login.vue') },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard',     component: () => import('../views/Dashboard.vue') },
      { path: 'map',           component: () => import('../views/MapView.vue') },
      { path: 'schools',       component: () => import('../views/Schools.vue') },
      { path: 'fleets',        component: () => import('../views/Fleets.vue') },
      { path: 'buses',         component: () => import('../views/Buses.vue') },
      { path: 'drivers',       component: () => import('../views/Drivers.vue') },
      { path: 'routes',        component: () => import('../views/Routes.vue') },
      { path: 'sessions',      component: () => import('../views/Sessions.vue') },
      { path: 'stops',         component: () => import('../views/Stops.vue') },
      { path: 'grades',        component: () => import('../views/Grades.vue') },
      { path: 'students',      component: () => import('../views/Students.vue') },
      { path: 'ride-assign',   component: () => import('../views/RideAssign.vue') },
      { path: 'records',       component: () => import('../views/Records.vue') },
      { path: 'notifications',   component: () => import('../views/Notifications.vue') },
      { path: 'escort-teachers', component: () => import('../views/EscortTeachers.vue') },
      { path: 'class-teachers',  component: () => import('../views/ClassTeachers.vue') }
    ]
  }
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.path !== '/login' && !auth.token) return '/login';
});

export default router;
