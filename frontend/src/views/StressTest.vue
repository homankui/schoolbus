<template>
  <el-card>
    <template #header><span>推送压力测试</span></template>

    <div style="max-width:700px">
      <el-form label-width="120px">
        <el-form-item label="测试数量">
          <el-input-number v-model="count" :min="1" :max="5000" :step="100" />
          <span style="margin-left:8px;color:#999;font-size:12px">最大5000条</span>
        </el-form-item>
        <el-form-item label="测试模式">
          <el-radio-group v-model="mode">
            <el-radio value="both">优化前 vs 优化后（对比）</el-radio>
            <el-radio value="sequential">仅优化前（逐条串行）</el-radio>
            <el-radio value="optimized">仅优化后（批量并发）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="模拟微信延迟">
          <el-switch v-model="simulateNetwork" />
          <span style="margin-left:8px;color:#999;font-size:12px">
            {{ simulateNetwork ? '每次推送模拟200ms网络延迟' : '无延迟（仅DB操作）' }}
          </span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="runTest" :loading="running">开始测试</el-button>
        </el-form-item>
      </el-form>

      <div v-if="result" style="margin-top:20px">
        <h4>测试结果 ({{ result.count }} 条)
          <el-tag v-if="result.simulateNetwork" type="warning" size="small" style="margin-left:8px">含200ms网络延迟</el-tag>
          <el-tag v-else type="info" size="small" style="margin-left:8px">仅DB操作</el-tag>
        </h4>

        <div style="width:100%;overflow-x:auto">
        <el-table v-if="result.sequential" :data="[result.sequential]" style="margin-bottom:12px">
          <el-table-column prop="label" label="模式" width="160" />
          <el-table-column prop="elapsedMs" label="总耗时(ms)" />
          <el-table-column prop="perSecond" label="吞吐量(条/秒)" />
          <el-table-column prop="avgMs" label="平均每条(ms)" />
          <el-table-column prop="success" label="成功" />
          <el-table-column prop="fail" label="失败" />
        </el-table>
        </div>

        <div style="width:100%;overflow-x:auto">
        <el-table v-if="result.concurrent" :data="[result.concurrent]" style="margin-bottom:12px">
          <el-table-column prop="label" label="模式" width="160" />
          <el-table-column prop="elapsedMs" label="总耗时(ms)" />
          <el-table-column prop="perSecond" label="吞吐量(条/秒)" />
          <el-table-column prop="avgMs" label="平均每条(ms)" />
          <el-table-column prop="success" label="成功" />
        </el-table>
        </div>

        <div v-if="result.sequential && result.concurrent"
          style="padding:12px;background:#f0f9eb;border-radius:4px;color:#67c23a">
          <strong>优化后比优化前快 {{ (result.sequential.elapsedMs / result.concurrent.elapsedMs).toFixed(1) }}x</strong>
          <span style="color:#999;margin-left:12px;font-size:13px">
            ({{ result.sequential.elapsedMs }}ms → {{ result.concurrent.elapsedMs }}ms)
          </span>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import api from '../api';
import { useIsMobile } from '../composables/useIsMobile';

const { isMobile } = useIsMobile();

const count = ref(100);
const mode = ref('both');
const simulateNetwork = ref(false);
const running = ref(false);
const result = ref(null);

async function runTest() {
  running.value = true;
  result.value = null;
  try {
    const res = await api.post('/stress-test/notifications', {
      count: count.value,
      mode: mode.value,
      simulateNetwork: simulateNetwork.value
    });
    result.value = res;
    ElMessage.success('测试完成');
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e?.message || '测试失败');
  } finally {
    running.value = false;
  }
}
</script>
