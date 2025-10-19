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
  if (typeof window === "undefined") {
    return true;
  }
  const host = window.location?.hostname || "";
  if (host === "localhost" || host === "127.0.0.1") {
    return false;
  }
  if (window.CRIME_FORCE_FIREBASE === true || window.CRIME_FORCE_FIREBASE === "true") {
    return true;
  }
  try {
    if (window.localStorage?.getItem("crime:forceFirebase") === "true") {
      return true;
    }
  } catch (error) {
    // no-op when storage is unavailable
  }
  return FIREBASE_ALLOWED_HOSTS.includes(host);
}

const FIREBASE_APP_URL = "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
const FIRESTORE_URL = "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let firebaseModulePromise = null;
let firebaseAppInstance = null;
let firestoreInstance = null;
let firebaseEnabled = shouldEnableFirebase();

async function loadFirebaseModules() {
  if (!firebaseEnabled) {
    return null;
  }
  if (!firebaseModulePromise) {
    firebaseModulePromise = (async () => {
      try {
        const [appModule, firestoreModule] = await Promise.all([
          import(FIREBASE_APP_URL),
          import(FIRESTORE_URL)
        ]);
        return {
          initializeApp: appModule.initializeApp,
          getApps: appModule.getApps,
          getApp: appModule.getApp,
          getFirestore: firestoreModule.getFirestore,
          collection: firestoreModule.collection,
          getDocs: firestoreModule.getDocs,
          setDoc: firestoreModule.setDoc,
          doc: firestoreModule.doc
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

async function ensureFirestore() {
  const libs = await loadFirebaseModules();
  if (!libs) return null;
  if (firestoreInstance) {
    return firestoreInstance;
  }
  if (!firebaseAppInstance) {
    const { getApps, getApp, initializeApp } = libs;
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
    const db = await ensureFirestore();
    if (!db) {
      return [];
    }
    const snapshot = await libs.getDocs(libs.collection(db, "scenarioSets"));
    return snapshot.docs
      .map((document) => ({ id: document.id, ...document.data() }))
      .filter((scenario) => scenario?.id && scenario?.title);
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
  const db = await ensureFirestore();
  if (!db) {
    throw new Error("FIREBASE_UNAVAILABLE");
  }
  try {
    const scenarioDoc = libs.doc(db, "scenarioSets", scenario.id);
    await libs.setDoc(scenarioDoc, scenario, { merge: true });
    return scenario;
  } catch (error) {
    console.error("시나리오 저장 실패", error);
    throw error;
  }
}
