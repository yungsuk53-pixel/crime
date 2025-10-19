import { firebaseList, firebaseCreate, firebaseUpdate, firebaseRemove } from './firebase.js';

const REMOTE_ALLOWED_HOSTS = ["zippy-bonbon-5a7dd7.netlify.app", "localhost", "127.0.0.1"];

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

function shouldUseRemoteApi() {
  if (typeof window === "undefined") {
    return true;
  }
  const host = window.location?.hostname || "";
  if (host === "localhost" || host === "127.0.0.1") {
    return false;
  }
  if (window.CRIME_FORCE_REMOTE_API === true || window.CRIME_FORCE_REMOTE_API === "true") {
    return true;
  }
  try {
    if (window.localStorage?.getItem("crime:forceRemoteApi") === "true") {
      return true;
    }
  } catch (error) {
    // storage access can fail in private mode
  }
  return REMOTE_ALLOWED_HOSTS.includes(host);
}

const API_BASE_URL = buildBaseUrl().replace(/\/$/, "");
const FALLBACK_STORAGE_KEY = "crimeSceneTable";
const FALLBACK_TABLES = ["sessions", "players", "chat_messages"];

let remoteApiEnabled = shouldUseRemoteApi();
let fallbackNoticeShown = false;

function buildUrl(path = "") {
  if (!path.startsWith("/")) {
    return `${API_BASE_URL}/${path}`;
  }
  return `${API_BASE_URL}${path}`;
}

function normaliseStore(candidate) {
  const base = { sessions: [], players: [], chat_messages: [] };
  FALLBACK_TABLES.forEach((table) => {
    base[table] = Array.isArray(candidate?.[table]) ? [...candidate[table]] : [];
  });
  return base;
}

function loadInitialStore() {
  if (typeof window === "undefined") {
    return normaliseStore();
  }
  try {
    const raw = window.localStorage?.getItem(FALLBACK_STORAGE_KEY);
    if (!raw) {
      return normaliseStore();
    }
    const parsed = JSON.parse(raw);
    return normaliseStore(parsed);
  } catch (error) {
    console.warn("로컬 저장소를 불러오지 못했습니다.", error);
    return normaliseStore();
  }
}

let fallbackStore = loadInitialStore();

function persistFallbackStore(store) {
  fallbackStore = normaliseStore(store);
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage?.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(fallbackStore));
  } catch (error) {
    // ignore write failures (storage quota or private mode)
  }
}

function updateFallbackStore(mutator) {
  const next = normaliseStore(mutator(fallbackStore));
  persistFallbackStore(next);
  return next;
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function recordMatchesSearch(table, record, term) {
  if (!term) {
    return true;
  }
  const needle = term.toLowerCase();
  switch (table) {
    case "sessions":
      return record.code?.toLowerCase() === needle;
    case "players":
      return (
        record.session_code?.toLowerCase().includes(needle) ||
        record.name?.toLowerCase().includes(needle)
      );
    case "chat_messages":
      return (
        record.session_code?.toLowerCase().includes(needle) ||
        record.player_name?.toLowerCase().includes(needle) ||
        record.message?.toLowerCase().includes(needle)
      );
    default:
      return false;
  }
}

async function fallbackList(table, params = {}) {
  const { limit = "50", search = "" } = params;
  const list = [...(fallbackStore[table] || [])]
    .filter((item) => recordMatchesSearch(table, item, search))
    .sort((a, b) => {
      const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
      const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
      return timeB - timeA;
    });
  const max = Number.parseInt(limit, 10);
  const sliced = Number.isFinite(max) ? list.slice(0, Math.max(max, 0)) : list;
  return { data: sliced };
}

async function fallbackCreate(table, data) {
  const now = new Date().toISOString();
  const record = {
    deleted: false,
    ...data,
    id: data.id || generateId(),
    created_at: data.created_at || now,
    updated_at: data.updated_at || now
  };
  updateFallbackStore((store) => ({
    ...store,
    [table]: [...(store[table] || []), record]
  }));
  return record;
}

async function fallbackUpdate(table, id, data) {
  const now = new Date().toISOString();
  let updatedRecord = null;
  updateFallbackStore((store) => {
    const collection = [...(store[table] || [])];
    const index = collection.findIndex((item) => item.id === id);
    if (index === -1) {
      updatedRecord = {
        deleted: false,
        ...data,
        id: id || generateId(),
        created_at: data.created_at || now,
        updated_at: now
      };
      collection.push(updatedRecord);
    } else {
      updatedRecord = {
        ...collection[index],
        ...data,
        id: collection[index].id,
        updated_at: now
      };
      collection[index] = updatedRecord;
    }
    return { ...store, [table]: collection };
  });
  return updatedRecord;
}

async function fallbackRemove(table, id) {
  updateFallbackStore((store) => {
    const collection = [...(store[table] || [])];
    const index = collection.findIndex((item) => item.id === id);
    if (index === -1) {
      return store;
    }
    const now = new Date().toISOString();
    collection[index] = {
      ...collection[index],
      deleted: true,
      updated_at: now
    };
    return { ...store, [table]: collection };
  });
}

function announceFallback(error) {
  if (fallbackNoticeShown) {
    return;
  }
  fallbackNoticeShown = true;
  console.warn("원격 Table API를 사용할 수 없어 브라우저 저장소로 전환합니다.", error);
}

async function handleRemoteResponse(response, failureMessage) {
  if (response.status === 204) {
    return null;
  }
  if (!response.ok) {
    const error = new Error(failureMessage);
    error.status = response.status;
    throw error;
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return null;
}

async function withFallback(remoteTask, fallbackTask) {
  if (remoteApiEnabled) {
    try {
      return await remoteTask();
    } catch (error) {
      remoteApiEnabled = false;
      announceFallback(error);
      return fallbackTask();
    }
  }
  return fallbackTask();
}

export const api = {
  async list(table, params = {}) {
    return withFallback(
      async () => firebaseList(table, params),
      () => fallbackList(table, params)
    );
  },
  async create(table, data) {
    return withFallback(
      async () => firebaseCreate(table, data),
      () => fallbackCreate(table, data)
    );
  },
  async update(table, id, data) {
    return withFallback(
      async () => firebaseUpdate(table, id, data),
      () => fallbackUpdate(table, id, data)
    );
  },
  async remove(table, id) {
    return withFallback(
      async () => firebaseRemove(table, id),
      () => fallbackRemove(table, id)
    );
  }
};
