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

let firebaseModulePromise = null;
let firebaseAppInstance = null;
let databaseInstance = null;
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

// Firebase API functions for sessions, players, chat_messages
// Firebase API functions for sessions, players, chat_messages
export async function firebaseList(table, params = {}) {
  const libs = await loadFirebaseModules();
  if (!libs) {
    console.error('[Firebase] 모듈을 로드할 수 없습니다');
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  const db = await ensureDatabase();
  if (!db) {
    console.error('[Firebase] 데이터베이스를 초기화할 수 없습니다');
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  const { limit = 50, search = "" } = params;
  try {
    const tableRef = libs.ref(db, table);
    const snapshot = await libs.get(tableRef);
    
    console.log(`[Firebase] ${table} 테이블 조회:`, snapshot.exists());
    
    if (!snapshot.exists()) {
      console.log(`[Firebase] ${table} 테이블이 비어있습니다`);
      return { data: [] };
    }
    const val = snapshot.val();
    if (!val || typeof val !== 'object') {
      console.warn(`[Firebase] ${table} 데이터가 올바르지 않습니다:`, val);
      return { data: [] };
    }
    
    let data = Object.entries(val).map(([id, value]) => {
      if (!value || typeof value !== 'object') {
        console.warn(`[Firebase] 잘못된 항목 발견:`, id, value);
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
    
    const result = { data: data.slice(0, limit) };
    console.log(`[Firebase] ${table} 조회 결과:`, result.data.length, '개 항목');
    return result;
  } catch (error) {
    console.error(`[Firebase] ${table} 조회 실패:`, error);
    throw error;
  }
}

export async function firebaseCreate(table, data) {
  const libs = await loadFirebaseModules();
  if (!libs) {
    console.error('[Firebase] 모듈을 로드할 수 없습니다');
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  const db = await ensureDatabase();
  if (!db) {
    console.error('[Firebase] 데이터베이스를 초기화할 수 없습니다');
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
    console.log(`[Firebase] ${table} 생성 시도:`, record);
    const tableRef = libs.ref(db, table);
    const newRef = libs.push(tableRef);
    await libs.set(newRef, record);
    const result = { id: newRef.key, ...record };
    console.log(`[Firebase] ${table} 생성 성공:`, result.id);
    return result;
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
    
    // 먼저 기존 데이터를 읽어옵니다
    const snapshot = await libs.get(itemRef);
    if (!snapshot.exists()) {
      throw new Error(`${table}/${id} not found`);
    }
    
    // 기존 데이터와 업데이트 데이터를 병합
    const existingData = snapshot.val();
    const mergedData = {
      ...existingData,
      ...updateData,
      id
    };
    
    // 업데이트 실행
    await libs.update(itemRef, updateData);
    
    console.log(`[Firebase] ${table}/${id} 업데이트 성공`);
    
    // 병합된 전체 데이터 반환
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
