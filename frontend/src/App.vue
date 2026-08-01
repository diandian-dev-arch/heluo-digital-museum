<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <el-container class="app-shell">
    <el-header class="site-header">
      <RouterLink class="brand" to="/">河洛数字博物馆</RouterLink>
      <nav aria-label="主导航">
        <RouterLink to="/explore">探索馆藏</RouterLink>
        <RouterLink to="/exhibits">数字展厅</RouterLink>
        <RouterLink to="/appointment">预约参观</RouterLink>
        <RouterLink to="/shop">河洛文创</RouterLink>
      </nav>
      <RouterLink class="login-link" to="/login">登录</RouterLink>
    </el-header>
    <el-main>
      <RouterView />
    </el-main>
    <el-footer>河洛数字博物馆 · 第一版工程骨架</el-footer>
  </el-container>
</template>
