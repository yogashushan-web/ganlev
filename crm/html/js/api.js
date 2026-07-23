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
  createChild: (data) => apiCall(`/children?garden_id=${getGardenId()}`, 'POST', data),
  updateChild: (id, data) => apiCall(`/children/${id}?garden_id=${getGardenId()}`, 'PUT', data),
  deleteChild: (id) => apiCall(`/children/${id}?garden_id=${getGardenId()}`, 'DELETE'),

  // Parents
  getParents: (childId) => apiCall(`/parents?garden_id=${getGardenId()}${childId ? `&child_id=${childId}` : ''}`),
  createParent: (data) => apiCall(`/parents?garden_id=${getGardenId()}`, 'POST', data),
  updateParent: (id, data) => apiCall(`/parents/${id}?garden_id=${getGardenId()}`, 'PUT', data),
  deleteParent: (id) => apiCall(`/parents/${id}?garden_id=${getGardenId()}`, 'DELETE'),

  // Staff
  getStaff: () => apiCall(`/staff?garden_id=${getGardenId()}`),
  createStaff: (data) => apiCall(`/staff?garden_id=${getGardenId()}`, 'POST', data),
  updateStaff: (id, data) => apiCall(`/staff/${id}?garden_id=${getGardenId()}`, 'PUT', data),
  deleteStaff: (id) => apiCall(`/staff/${id}?garden_id=${getGardenId()}`, 'DELETE'),

  // Salaries
  getSalaries: (monthYear) => apiCall(`/salaries?garden_id=${getGardenId()}&month_year=${monthYear}`),
  createSalary: (data) => apiCall(`/salaries?garden_id=${getGardenId()}`, 'POST', data),
  updateSalary: (id, data) => apiCall(`/salaries/${id}?garden_id=${getGardenId()}`, 'PUT', data),

  // Tuition
  getTuition: (status) => apiCall(`/tuition?garden_id=${getGardenId()}${status ? `&status=${status}` : ''}`),
  createTuition: (data) => apiCall(`/tuition?garden_id=${getGardenId()}`, 'POST', data),
  updateTuition: (id, data) => apiCall(`/tuition/${id}?garden_id=${getGardenId()}`, 'PUT', data),

  // Income/Expenses
  getIncome: (dateFrom, dateTo) => apiCall(`/income?garden_id=${getGardenId()}&date_from=${dateFrom}&date_to=${dateTo}`),
  getExpenses: (dateFrom, dateTo) => apiCall(`/expenses?garden_id=${getGardenId()}&date_from=${dateFrom}&date_to=${dateTo}`),
  createIncome: (data) => apiCall(`/income?garden_id=${getGardenId()}`, 'POST', data),
  createExpense: (data) => apiCall(`/expenses?garden_id=${getGardenId()}`, 'POST', data),
  updateIncome: (id, data) => apiCall(`/income/${id}?garden_id=${getGardenId()}`, 'PUT', data),
  updateExpense: (id, data) => apiCall(`/expenses/${id}?garden_id=${getGardenId()}`, 'PUT', data),
  deleteIncome: (id) => apiCall(`/income/${id}?garden_id=${getGardenId()}`, 'DELETE'),
  deleteExpense: (id) => apiCall(`/expenses/${id}?garden_id=${getGardenId()}`, 'DELETE'),

  // Dashboard
  getDashboardSummary: () => apiCall(`/dashboard-summary?garden_id=${getGardenId()}`),

  // Bulk import (children / income / expenses)
  importRows: (type, rows) => apiCall('/import-rows', 'POST', { type, rows, garden_id: getGardenId() }),

  // Calendar events
  getEvents: (calendar, from, to) => apiCall(`/events?garden_id=${getGardenId()}${calendar ? `&calendar=${calendar}` : ''}${from ? `&date_from=${from}` : ''}${to ? `&date_to=${to}` : ''}`),
  createEvent: (data) => apiCall(`/events?garden_id=${getGardenId()}`, 'POST', data),
  updateEvent: (id, data) => apiCall(`/events/${id}?garden_id=${getGardenId()}`, 'PUT', data),
  deleteEvent: (id) => apiCall(`/events/${id}?garden_id=${getGardenId()}`, 'DELETE'),

  // Convert an iPhone HEIC image to JPEG (server-side)
  convertHeic: (file_base64) => apiCall('/convert-heic', 'POST', { file_base64 }),

  // Parse a signed child enrollment contract → child + parents (AI)
  parseChildContract: (file_base64, content_type) => apiCall('/parse-child-contract', 'POST', { file_base64, content_type }),

  // Documents (file library)
  getDocuments: (section) => apiCall(`/documents?garden_id=${getGardenId()}${section ? `&section=${section}` : ''}`),
  uploadDocument: (data) => apiCall(`/documents?garden_id=${getGardenId()}`, 'POST', data),
  deleteDocument: (id) => apiCall(`/documents/${id}?garden_id=${getGardenId()}`, 'DELETE'),

  // Utilities (water / electricity / property tax ...)
  getUtilities: () => apiCall(`/utilities?garden_id=${getGardenId()}`),
  createUtility: (data) => apiCall(`/utilities?garden_id=${getGardenId()}`, 'POST', data),
  updateUtility: (id, data) => apiCall(`/utilities/${id}?garden_id=${getGardenId()}`, 'PUT', data),
  deleteUtility: (id) => apiCall(`/utilities/${id}?garden_id=${getGardenId()}`, 'DELETE'),

  // Form 101 → auto-extract employee profile via AI
  parse101: (file_base64) => apiCall('/parse-101', 'POST', { file_base64 }),

  // Recycle bin
  getTrash: () => apiCall(`/trash?garden_id=${getGardenId()}`),
  restoreTrash: (id) => apiCall(`/trash?garden_id=${getGardenId()}`, 'POST', { id }),
  purgeTrash: (id) => apiCall(`/trash/${id}?garden_id=${getGardenId()}`, 'DELETE'),

  // Event cards ("מעגל השנה") — anchor loop: prep -> ביצוע -> summary -> saved to file
  getEventCards: (opts = {}) => apiCall(`/event-cards?garden_id=${getGardenId()}${opts.staff_id ? `&staff_id=${opts.staff_id}` : ''}${opts.child_id ? `&child_id=${opts.child_id}` : ''}${opts.event_id ? `&event_id=${opts.event_id}` : ''}`),
  createEventCard: (data) => apiCall(`/event-cards?garden_id=${getGardenId()}`, 'POST', data),
  updateEventCard: (id, data) => apiCall(`/event-cards/${id}?garden_id=${getGardenId()}`, 'PUT', data),
  deleteEventCard: (id) => apiCall(`/event-cards/${id}?garden_id=${getGardenId()}`, 'DELETE'),

  // "שנת הצהריים" nap-ritual forms (staff view)
  getNapForms: () => apiCall(`/nap-list?garden_id=${getGardenId()}`),

  // Birthday-call reminders — backfill for all current-year children
  generateBirthdayReminders: () => apiCall(`/birthday-reminders?garden_id=${getGardenId()}`, 'POST'),
};
