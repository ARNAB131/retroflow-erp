const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(data?.detail || "Request failed");
  }

  return data;
}

export const api = {
  dashboard: () => request("/api/dashboard"),

  list: (table) => request(`/api/${table}`),

  create: (table, data) =>
    request(`/api/${table}`, {
      method: "POST",
      body: JSON.stringify({ data }),
    }),

  update: (table, id, data) =>
    request(`/api/${table}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ data }),
    }),

  remove: (table, id) =>
    request(`/api/${table}/${id}`, {
      method: "DELETE",
    }),

  runAutomation: () =>
    request("/api/automation/run", {
      method: "POST",
    }),
};
