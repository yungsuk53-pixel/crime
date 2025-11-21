const firebaseConfig = {
  apiKey: "AIzaSyDReY-UP7IPh8bHME0-skOtxHBaTyHATHI",
  authDomain: "meeting-8a180.firebaseapp.com",
  databaseURL: "https://meeting-8a180-default-rtdb.firebaseio.com",
  projectId: "meeting-8a180",
  storageBucket: "meeting-8a180.appspot.com",
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
const FIRESTORE_URL = "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let firebaseModulePromise = null;
let firebaseStorageModulePromise = null;
let firebaseFirestoreModulePromise = null;
let firebaseAppInstance = null;
let databaseInstance = null;
let storageInstance = null;
let firestoreInstance = null;
let firebaseEnabled = shouldEnableFirebase();

function bufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("FILE_REQUIRED"));
      return;
    }
    if (typeof FileReader !== "undefined") {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("FILE_READ_FAILED"));
      reader.readAsDataURL(file);
      return;
    }
    if (typeof file.arrayBuffer === "function") {
      file.arrayBuffer()
        .then((buffer) => {
          const base64 = bufferToBase64(buffer);
          const dataUrl = `data:${file.type || "application/octet-stream"};base64,${base64}`;
          resolve(dataUrl);
        })
        .catch((error) => reject(error));
      return;
    }
    reject(new Error("FILE_READER_UNAVAILABLE"));
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("BLOB_READ_FAILED"));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (!canvas.toBlob) {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    readFileAsDataURL(file)
      .then((dataUrl) => {
        image.src = dataUrl;
      })
      .catch(reject);
  });
}

async function compressFileToDataUrl(file, options = {}) {
  const maxBytes = options.maxBytes ?? 950000;
  const maxDimension = options.maxDimension ?? 1600;
  if (!file) {
    throw new Error("FILE_REQUIRED");
  }
  const originalSize = file.size ?? 0;
  const mimeType = file.type || "application/octet-stream";
  if (!mimeType.startsWith("image/")) {
    const dataUrl = await readFileAsDataURL(file);
    return { dataUrl, contentType: mimeType, bytes: originalSize };
  }
  if (originalSize && originalSize <= maxBytes) {
    const dataUrl = await readFileAsDataURL(file);
    return { dataUrl, contentType: mimeType, bytes: originalSize };
  }

  const image = await loadImageFromFile(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const dataUrl = await readFileAsDataURL(file);
    return { dataUrl, contentType: mimeType, bytes: originalSize };
  }

  let targetWidth = image.width;
  let targetHeight = image.height;
  const largestSide = Math.max(targetWidth, targetHeight);
  if (largestSide > maxDimension) {
    const scale = maxDimension / largestSide;
    targetWidth = Math.max(1, Math.round(targetWidth * scale));
    targetHeight = Math.max(1, Math.round(targetHeight * scale));
  }

  let quality = 0.9;
  let blob = null;
  let attempts = 0;
  const minQuality = 0.35;

  while (attempts < 8) {
    attempts += 1;
    canvas.width = Math.max(1, Math.round(targetWidth));
    canvas.height = Math.max(1, Math.round(targetHeight));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (!blob) {
      break;
    }
    if (blob.size <= maxBytes) {
      break;
    }
    if (quality > minQuality) {
      quality = Math.max(minQuality, quality - 0.15);
    } else {
      targetWidth *= 0.85;
      targetHeight *= 0.85;
    }
  }

  if (!blob) {
    const fallback = await readFileAsDataURL(file);
    return { dataUrl: fallback, contentType: mimeType, bytes: originalSize };
  }

  const dataUrl = await blobToDataURL(blob);
  return {
    dataUrl,
    contentType: "image/jpeg",
    bytes: blob.size
  };
}

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

async function loadFirebaseFirestoreModule() {
  if (!firebaseEnabled) {
    return null;
  }
  if (!firebaseFirestoreModulePromise) {
    firebaseFirestoreModulePromise = (async () => {
      try {
        const firestoreModule = await import(FIRESTORE_URL);
        return {
          getFirestore: firestoreModule.getFirestore,
          collection: firestoreModule.collection,
          doc: firestoreModule.doc,
          setDoc: firestoreModule.setDoc,
          serverTimestamp: firestoreModule.serverTimestamp
        };
      } catch (error) {
        console.warn("Firebase Firestore 모듈 로딩 실패", error);
        return null;
      }
    })();
  }
  return firebaseFirestoreModulePromise;
}

async function ensureFirestore() {
  const libs = await loadFirebaseFirestoreModule();
  if (!libs) return null;
  if (firestoreInstance) {
    return firestoreInstance;
  }
  if (!firebaseAppInstance) {
    const appLibs = await loadFirebaseModules();
    if (!appLibs) return null;
    const { getApps, getApp, initializeApp } = appLibs;
    firebaseAppInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  firestoreInstance = libs.getFirestore(firebaseAppInstance);
  return firestoreInstance;
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

export async function uploadGraphicsAssets(files = [], scenarioId) {
  if (!scenarioId) {
    throw new Error("SCENARIO_ID_REQUIRED");
  }
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("GRAPHICS_FILES_REQUIRED");
  }
  const firestoreLibs = await loadFirebaseFirestoreModule();
  if (!firestoreLibs) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  const firestore = await ensureFirestore();
  if (!firestore) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }

  const uploads = [];
  for (const file of files) {
    if (!file) continue;
    const safeName = (file.name || "graphics-asset").replace(/\s+/g, "-");
    const path = `graphicsEvidence/${scenarioId}/${Date.now()}-${safeName}`;
    try {
      const compressed = await compressFileToDataUrl(file);
      const dataUrl = compressed.dataUrl;
      const scenarioCollection = firestoreLibs.collection(firestore, "graphicsEvidence", scenarioId, "items");
      const assetDocRef = firestoreLibs.doc(scenarioCollection, path.split("/").pop());
      await firestoreLibs.setDoc(assetDocRef, {
        scenarioId,
        fileName: safeName,
        bytes: compressed.bytes ?? file.size ?? 0,
        contentType: compressed.contentType || file.type || "application/octet-stream",
        dataUrl,
        path,
        uploadedAt: firestoreLibs.serverTimestamp()
      });
      uploads.push({
        url: dataUrl,
        path,
        firestorePath: assetDocRef.path,
        originalName: file.name || safeName,
        bytes: compressed.bytes ?? file.size ?? 0,
        contentType: compressed.contentType ?? file.type ?? "application/octet-stream",
        uploadedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("그래픽 자산 업로드 실패", error);
      throw error;
    }
  }
  return uploads;
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
