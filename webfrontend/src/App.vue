<template>
  <div class="container">
    <h1>Ecommerce Order Queue</h1>
    <form @submit.prevent="submitOrder">
      <label>
        Product Link:
        <input v-model="form.url" type="url" required placeholder="Paste product URL here" />
      </label>
      <label>
        Task:
        <select v-model="form.task">
          <option value="order">Order</option>
          <option value="add_to_cart">Add to Cart</option>
        </select>
      </label>
      <label>
        Delivery Address:
        <input v-model="form.delivery_address" type="text" placeholder="Optional" />
      </label>
      <label>
        Payment Method:
        <input v-model="form.payment_method" type="text" placeholder="Optional" />
      </label>
      <button type="submit" :disabled="loading">Queue Order</button>
    </form>
    <div v-if="loading">Processing...</div>
    <div v-if="result" class="result">
      <h2>Result</h2>
      <pre>{{ result }}</pre>
    </div>
    <div v-if="error" class="error">
      <h2>Error</h2>
      <pre>{{ error }}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import axios from 'axios';

const form = ref({
  url: '',
  task: 'order',
  delivery_address: '',
  payment_method: '',
});
const loading = ref(false);
const result = ref(null);
const error = ref(null);

async function submitOrder() {
  loading.value = true;
  result.value = null;
  error.value = null;
  try {
    const response = await axios.post('/order', {
      url: form.value.url,
      task: form.value.task,
      delivery_address: form.value.delivery_address || undefined,
      payment_method: form.value.payment_method || undefined,
    });
    result.value = response.data;
  } catch (e) {
    error.value = e.response?.data?.detail || e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.container {
  max-width: 500px;
  margin: 2rem auto;
  padding: 2rem;
  border-radius: 8px;
  background: #f9f9f9;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
h1 {
  text-align: center;
  margin-bottom: 1.5rem;
}
form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
input, select {
  width: 100%;
  padding: 0.5rem;
  border-radius: 4px;
  border: 1px solid #ccc;
}
button {
  padding: 0.75rem;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
button:disabled {
  background: #aaa;
}
.result, .error {
  margin-top: 2rem;
  padding: 1rem;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.03);
}
.error {
  border: 1px solid #e74c3c;
  color: #e74c3c;
}
</style>
