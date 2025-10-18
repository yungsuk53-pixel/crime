function buildBaseUrl() {
  const defaultBase = "https://zippy-bonbon-5a7dd7.netlify.app";
  if (typeof window === "undefined") {
    return defaultBase;
  }
  const { origin } = window.location;
  if (origin.includes("zippy-bonbon-5a7dd7.netlify.app")) {
    return origin;
  }
  return defaultBase;
}

const API_BASE_URL = buildBaseUrl().replace(/\/$/, "");

function buildUrl(path = "") {
  if (!path.startsWith("/")) {
    return `${API_BASE_URL}/${path}`;
  }
  return `${API_BASE_URL}${path}`;
}

export const api = {
  async list(table, params = {}) {
    const searchParams = new URLSearchParams({ limit: "50", ...params });
    const response = await fetch(
      buildUrl(`/tables/${table}?${searchParams.toString()}`)
    );
    if (!response.ok) {
      throw new Error("데이터를 불러오는 중 오류가 발생했습니다.");
    }
    return response.json();
  },
  async create(table, data) {
    const response = await fetch(buildUrl(`/tables/${table}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      throw new Error("데이터를 생성하지 못했습니다.");
    }
    return response.json();
  },
  async update(table, id, data) {
    const response = await fetch(buildUrl(`/tables/${table}/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      throw new Error("데이터를 수정하지 못했습니다.");
    }
    return response.json();
  },
  async remove(table, id) {
    const response = await fetch(buildUrl(`/tables/${table}/${id}`), {
      method: "DELETE"
    });
    if (!response.ok && response.status !== 204) {
      throw new Error("데이터를 삭제하지 못했습니다.");
    }
  }
};
