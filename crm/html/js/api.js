// Frontend API wrapper with auth handling
const API_BASE = '/.netlify/functions';

async function apiCall(endpoint, method = 'GET', body = null) {
  const token = localStorage.getItem('crm_token');

  if (!token) {
    window.location.href = '/crm/html/login.html';
    throw new Error('No authentication token');
  }

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(API_BASE + endpoint, options);
    const data = await res.json();

    if (res.status === 401 || res.status === 403) {
      // Token expired or invalid
      localStorage.removeItem('crm_token');
      localStorage.removeItem('crm_user');
      localStorage.removeItem('crm_garden_id');
      window.location.href = '/crm/html/login.html';
      throw new Error(data.error || 'Authentication failed');
    }

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    return data;
  } catch (err) {
    throw err;
  }
}

function getToken() {
  return localStorage.getItem('crm_token');
}

function getUser() {
  const user = localStorage.getItem('crm_user');
  return user ? JSON.parse(user) : null;
}

function getGardenId() {
  return localStorage.getItem('crm_garden_id');
}

function logout() {
  localStorage.removeItem('crm_token');
  localStorage.removeItem('crm_user');
  localStorage.removeItem('crm_garden_id');
  window.location.href = '/crm/html/login.html';
}

// API methods
const api = {
  // Children
  getChildren: () => apiCall(`/children?garden_id=${getGardenId()}`),
  createChild: (data) => apiCall('/children', 'POST', { ...data, garden_id: getGardenId() }),
  updateChild: (id, data) => apiCall(`/children/${id}`, 'PUT', data),
  deleteChild: (id) => apiCall(`/children/${id}`, 'DELETE'),

  // Parents
  getParents: (childId) => apiCall(`/parents?garden_id=${getGardenId()}${childId ? `&child_id=${childId}` : ''}`),
  createParent: (data) => apiCall('/parents', 'POST', { ...data, garden_id: getGardenId() }),
  updateParent: (id, data) => apiCall(`/parents/${id}`, 'PUT', data),
  deleteParent: (id) => apiCall(`/parents/${id}`, 'DELETE'),

  // Staff
  getStaff: () => apiCall(`/staff?garden_id=${getGardenId()}`),
  createStaff: (data) => apiCall('/staff', 'POST', { ...data, garden_id: getGardenId() }),
  updateStaff: (id, data) => apiCall(`/staff/${id}`, 'PUT', data),
  deleteStaff: (id) => apiCall(`/staff/${id}`, 'DELETE'),

  // Salaries
  getSalaries: (monthYear) => apiCall(`/salaries?garden_id=${getGardenId()}&month_year=${monthYear}`),
  createSalary: (data) => apiCall('/salaries', 'POST', { ...data, garden_id: getGardenId() }),
  updateSalary: (id, data) => apiCall(`/salaries/${id}`, 'PUT', data),

  // Tuition
  getTuition: (status) => apiCall(`/tuition?garden_id=${getGardenId()}${status ? `&status=${status}` : ''}`),
  createTuition: (data) => apiCall('/tuition', 'POST', { ...data, garden_id: getGardenId() }),
  updateTuition: (id, data) => apiCall(`/tuition/${id}`, 'PUT', data),

  // Income/Expenses
  getIncome: (dateFrom, dateTo) => apiCall(`/income?garden_id=${getGardenId()}&date_from=${dateFrom}&date_to=${dateTo}`),
  getExpenses: (dateFrom, dateTo) => apiCall(`/expenses?garden_id=${getGardenId()}&date_from=${dateFrom}&date_to=${dateTo}`),
  createIncome: (data) => apiCall('/income', 'POST', { ...data, garden_id: getGardenId() }),
  createExpense: (data) => apiCall('/expenses', 'POST', { ...data, garden_id: getGardenId() }),
  updateExpense: (id, data) => apiCall(`/expenses/${id}`, 'PUT', data),

  // Dashboard
  getDashboardSummary: () => apiCall(`/dashboard-summary?garden_id=${getGardenId()}`),

  // Bulk import (children / income / expenses)
  importRows: (type, rows) => apiCall('/import-rows', 'POST', { type, rows, garden_id: getGardenId() }),
};
