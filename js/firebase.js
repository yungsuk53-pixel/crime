const firebaseConfig = {
  apiKey: "AIzaSyDReY-UP7IPh8bHME0-skOtxHBaTyHATHI",
  authDomain: "meeting-8a180.firebaseapp.com",
  databaseURL: "https://meeting-8a180-default-rtdb.firebaseio.com",
  projectId: "meeting-8a180",
  storageBucket: "meeting-8a180.firebasestorage.app",
  messagingSenderId: "666012646007",
  appId: "1:666012646007:web:ae60fb9ab57730bb5de472",
  measurementId: "G-37RQG0RYWM"
};

const FIREBASE_ALLOWED_HOSTS = ["zippy-bonbon-5a7dd7.netlify.app"];

function shouldEnableFirebase() {
  return true; // Always enable Firebase
}

const FIREBASE_APP_URL = "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
const DATABASE_URL = "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
const STORAGE_URL = "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

let firebaseModulePromise = null;
let firebaseStorageModulePromise = null;
let firebaseAppInstance = null;
let databaseInstance = null;
let storageInstance = null;
let firebaseEnabled = shouldEnableFirebase();

async function loadFirebaseModules() {
  if (!firebaseEnabled) {
    return null;
  }
  if (!firebaseModulePromise) {
    firebaseModulePromise = (async () => {
      try {
        const [appModule, databaseModule] = await Promise.all([
          import(FIREBASE_APP_URL),
          import(DATABASE_URL)
        ]);
        return {
          initializeApp: appModule.initializeApp,
          getApps: appModule.getApps,
          getApp: appModule.getApp,
          getDatabase: databaseModule.getDatabase,
          ref: databaseModule.ref,
          set: databaseModule.set,
          get: databaseModule.get,
          push: databaseModule.push,
          update: databaseModule.update,
          remove: databaseModule.remove,
          onValue: databaseModule.onValue,
          off: databaseModule.off,
          query: databaseModule.query,
          orderByChild: databaseModule.orderByChild,
          equalTo: databaseModule.equalTo,
          limitToLast: databaseModule.limitToLast
        };
      } catch (error) {
        console.warn("Firebase 모듈 로딩 실패", error);
        firebaseEnabled = false;
        return null;
      }
    })();
  }
  return firebaseModulePromise;
}

async function ensureDatabase() {
  const libs = await loadFirebaseModules();
  if (!libs) return null;
  if (databaseInstance) {
    return databaseInstance;
  }
  if (!firebaseAppInstance) {
    const { getApps, getApp, initializeApp } = libs;
    firebaseAppInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  databaseInstance = libs.getDatabase(firebaseAppInstance);
  return databaseInstance;
}

async function loadFirebaseStorageModule() {
  if (!firebaseEnabled) {
    return null;
  }
  if (!firebaseStorageModulePromise) {
    firebaseStorageModulePromise = (async () => {
      try {
        const storageModule = await import(STORAGE_URL);
        return {
          getStorage: storageModule.getStorage,
          ref: storageModule.ref,
          uploadBytes: storageModule.uploadBytes,
          getDownloadURL: storageModule.getDownloadURL
        };
      } catch (error) {
        console.warn("Firebase Storage 모듈 로딩 실패", error);
        return null;
      }
    })();
  }
  return firebaseStorageModulePromise;
}

async function ensureStorage() {
  const libs = await loadFirebaseStorageModule();
  if (!libs) return null;
  if (storageInstance) {
    return storageInstance;
  }
  if (!firebaseAppInstance) {
    const appLibs = await loadFirebaseModules();
    if (!appLibs) return null;
    const { getApps, getApp, initializeApp } = appLibs;
    firebaseAppInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  storageInstance = libs.getStorage(firebaseAppInstance);
  return storageInstance;
}

export async function fetchRemoteScenarios() {
  if (!firebaseEnabled) {
    return [];
  }
  try {
    const libs = await loadFirebaseModules();
    if (!libs) {
      return [];
    }
    const db = await ensureDatabase();
    if (!db) {
      return [];
    }
    const tableRef = libs.ref(db, "scenarioSets");
    const snapshot = await libs.get(tableRef);
    if (!snapshot.exists()) {
      return [];
    }
    const data = Object.entries(snapshot.val()).map(([id, value]) => ({ id, ...value }));
    return data.filter((scenario) => scenario?.id && scenario?.title);
  } catch (error) {
    console.warn("원격 사건 세트를 불러오지 못했습니다.", error);
    firebaseEnabled = false;
    return [];
  }
}

export async function saveScenarioSet(scenario) {
  if (!scenario?.id) {
    throw new Error("SCENARIO_ID_REQUIRED");
  }
  const libs = await loadFirebaseModules();
  if (!libs) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  const db = await ensureDatabase();
  if (!db) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  try {
    const scenarioRef = libs.ref(db, `scenarioSets/${scenario.id}`);
    await libs.set(scenarioRef, scenario);
    return scenario;
  } catch (error) {
    console.error("시나리오 저장 실패", error);
    throw error;
  }
}

export async function uploadGraphicsBundle(file, scenarioId) {
  if (!file) {
    throw new Error("GRAPHICS_FILE_REQUIRED");
  }
  if (!scenarioId) {
    throw new Error("SCENARIO_ID_REQUIRED");
  }
  const libs = await loadFirebaseStorageModule();
  if (!libs) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  const storage = await ensureStorage();
  if (!storage) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  const safeName = (file.name || "graphics-bundle.zip").replace(/\s+/g, "-");
  const path = `graphicsBundles/${scenarioId}/${safeName}`;
  try {
    const bundleRef = libs.ref(storage, path);
    const snapshot = await libs.uploadBytes(bundleRef, file);
    const url = await libs.getDownloadURL(bundleRef);
    const size = snapshot?.metadata?.size ?? file.size ?? 0;
    const contentType = snapshot?.metadata?.contentType ?? file.type ?? "application/octet-stream";
    return {
      url,
      path,
      bytes: size,
      contentType,
      uploadedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("그래픽 번들 업로드 실패", error);
    throw error;
  }
}

// Firebase API functions for sessions, players, chat_messages
// Firebase API functions for sessions, players, chat_messages
export async function firebaseList(table, params = {}) {
  const libs = await loadFirebaseModules();
  if (!libs) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  const db = await ensureDatabase();
  if (!db) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  const { limit = 50, search = "" } = params;
  try {
    const tableRef = libs.ref(db, table);
    const snapshot = await libs.get(tableRef);
    
    if (!snapshot.exists()) {
      return { data: [] };
    }
    const val = snapshot.val();
    if (!val || typeof val !== 'object') {
      return { data: [] };
    }
    
    let data = Object.entries(val).map(([id, value]) => {
      if (!value || typeof value !== 'object') {
        return null;
      }
      return { id, ...value };
    }).filter(item => item !== null);
    
    // Filter deleted items
    data = data.filter(item => !item.deleted);
    
    // Apply search filter
    if (search) {
      if (table === "sessions") {
        data = data.filter(item => item.code && item.code.toUpperCase() === search.toUpperCase());
      } else if (table === "players") {
        data = data.filter(item => item.session_code && item.session_code.toUpperCase() === search.toUpperCase());
      } else if (table === "chat_messages") {
        data = data.filter(item => item.session_code && item.session_code.toUpperCase() === search.toUpperCase());
      }
    }
    
    // Sort by updated_at or created_at
    data.sort((a, b) => {
      const timeA = new Date(a.updated_at || a.created_at || 0);
      const timeB = new Date(b.updated_at || b.created_at || 0);
      return timeB - timeA;
    });
    
    return { data: data.slice(0, limit) };
  } catch (error) {
    console.error(`[Firebase] ${table} 조회 실패:`, error);
    throw error;
  }
}

export async function firebaseCreate(table, data) {
  const libs = await loadFirebaseModules();
  if (!libs) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  const db = await ensureDatabase();
  if (!db) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  const now = new Date().toISOString();
  const record = {
    ...data,
    created_at: data.created_at || now,
    updated_at: data.updated_at || now,
    deleted: false
  };
  try {
    const tableRef = libs.ref(db, table);
    const newRef = libs.push(tableRef);
    await libs.set(newRef, record);
    return { id: newRef.key, ...record };
  } catch (error) {
    console.error(`[Firebase] ${table} 생성 실패:`, error);
    throw error;
  }
}

export async function firebaseUpdate(table, id, data) {
  const libs = await loadFirebaseModules();
  if (!libs) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  const db = await ensureDatabase();
  if (!db) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  const now = new Date().toISOString();
  const updateData = {
    ...data,
    updated_at: now
  };
  try {
    const itemRef = libs.ref(db, `${table}/${id}`);
    
    const snapshot = await libs.get(itemRef);
    if (!snapshot.exists()) {
      throw new Error(`${table}/${id} not found`);
    }
    
    const existingData = snapshot.val();
    const mergedData = {
      ...existingData,
      ...updateData,
      id
    };
    
    await libs.update(itemRef, updateData);
    
    return mergedData;
  } catch (error) {
    console.error(`[Firebase] ${table} 업데이트 실패:`, error);
    throw error;
  }
}

export async function firebaseRemove(table, id) {
  const libs = await loadFirebaseModules();
  if (!libs) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  const db = await ensureDatabase();
  if (!db) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  try {
    const itemRef = libs.ref(db, `${table}/${id}`);
    await libs.update(itemRef, { deleted: true, updated_at: new Date().toISOString() });
  } catch (error) {
    console.error(`Firebase remove ${table} failed`, error);
    throw error;
  }
}
